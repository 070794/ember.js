import { ENV } from 'ember-environment';
import { assert, deprecate, runInDebug } from 'ember-metal/debug';
import dictionary from 'ember-metal/dictionary';
import { setOwner, OWNER } from './owner';
import { buildFakeContainerWithDeprecations } from 'ember-runtime/mixins/container_proxy';
import symbol from 'ember-metal/symbol';

const CONTAINER_OVERRIDE = symbol('CONTAINER_OVERRIDE');

/**
 A container used to instantiate and cache objects.

 Every `Container` must be associated with a `Registry`, which is referenced
 to determine the factory and options that should be used to instantiate
 objects.

 The public API for `Container` is still in flux and should not be considered
 stable.

 @private
 @class Container
 */
export default function Container(registry, options) {
  this.registry        = registry;
  this.owner           = options && options.owner ? options.owner : null;
  this.cache           = dictionary(options && options.cache ? options.cache : null);
  this.factoryCache    = dictionary(options && options.factoryCache ? options.factoryCache : null);
  this.validationCache = dictionary(options && options.validationCache ? options.validationCache : null);
  this._fakeContainerToInject = buildFakeContainerWithDeprecations(this);
  this[CONTAINER_OVERRIDE] = undefined;
  this.isDestroyed = false;
}

Container.prototype = {
  /**
   @private
   @property owner
   @type Object
   */
  owner: null,
  
  /**
   @private
   @property registry
   @type Registry
   @since 1.11.0
   */
  registry: null,
  
  /**
   @private
   @property cache
   @type InheritingDict
   */
  cache: null,
  
  /**
   @private
   @property factoryCache
   @type InheritingDict
   */
  factoryCache: null,
  
  /**
   @private
   @property validationCache
   @type InheritingDict
   */
  validationCache: null,
  
  /**
   Given a fullName return a corresponding instance.
   The default behaviour is for lookup to return a singleton instance.
   The singleton is scoped to the container, allowing multiple containers
   to all have their own locally scoped singletons.

   ```javascript
   let registry = new Registry();
   let container = registry.container();

   registry.register('api:twitter', Twitter);

   let twitter = container.lookup('api:twitter');

   twitter instanceof Twitter; // => true

   // by default the container will return singletons
   let twitter2 = container.lookup('api:twitter');
   twitter2 instanceof Twitter; // => true

   twitter === twitter2; //=> true
   ```

   If singletons are not wanted, an optional flag can be provided at lookup.

   ```javascript
   let registry = new Registry();
   let container = registry.container();

   registry.register('api:twitter', Twitter);

   let twitter = container.lookup('api:twitter', { singleton: false });
   let twitter2 = container.lookup('api:twitter', { singleton: false });

   twitter === twitter2; //=> false
   ```

   @private
   @method lookup
   @param {String} fullName
   @param {Object} [options]
   @param {String} [options.source] The fullname of the request source (used for local lookup)
   @return {any}
   */
  lookup(fullName, options) {
    assert('fullName must be a proper full name', this.registry.validateFullName(fullName));
    return lookup(this, this.registry.normalize(fullName), options);
  },
  /**
   Given a fullName, return the corresponding factory.

   @private
   @method lookupFactory
   @param {String} fullName
   @param {Object} [options]
   @param {String} [options.source] The fullname of the request source (used for local lookup)
   @return {any}
   */
  lookupFactory(fullName, options) {
    assert('fullName must be a proper full name', this.registry.validateFullName(fullName));
    return factoryFor(this, this.registry.normalize(fullName), options);
  },

  /**
   A depth first traversal, destroying the container, its descendant containers and all
   their managed objects.

   @private
   @method destroy
   */
  destroy() {
    eachDestroyable(this, item => {
      if (item.destroy) {
        item.destroy();
      }
    });

    this.isDestroyed = true;
  },

  /**
   Clear either the entire cache or just the cache for a particular key.

   @private
   @method reset
   @param {String} fullName optional key to reset; if missing, resets everything
   */
  reset(fullName) {
    if (arguments.length > 0) {
      resetMember(this, this.registry.normalize(fullName));
    } else {
      resetCache(this);
    }
  },

  /**
   Returns an object that can be used to provide an owner to a
   manually created instance.

   @private
   @method ownerInjection
   @returns { Object }
  */
  ownerInjection() {
    return { [OWNER]: this.owner };
  }
};

function isSingleton(container, fullName) {
  return container.registry.getOption(fullName, 'singleton') !== false;
}
/** 
@Descrition  In this function the search of the data in the container is done. If the data is found then returned the data otherwise create a new object and validate its properties. 
 @param container;
 @param {String} fullName
 @param options{} its an array
returns {any}
*/
function lookup(container, fullName, options = {}) { // if the lookup is not supported then it is returning the null value. 
  if (options.source) {
    fullName = container.registry.expandLocalLookup(fullName, options);
        // if expandLocalLookup returns falsey, we do not support local lookup
    if (!fullName) { return; }
  }
  if (container.cache[fullName] !== undefined && options.singleton !== false) {
    return container.cache[fullName];      // if its already available in the cache then returning it.
  }
  let value = instantiate(container, fullName);    // if not available then create a new cache object in the container.
  if (value === undefined) { return; } // if the value object is not created then return null.
  if (isSingleton(container, fullName) && options.singleton !== false) { /*validating the new created object. */
    container.cache[fullName] = value;
  }
  return value;
}


function markInjectionsAsDynamic(injections) {
  injections._dynamic = true;
}

function areInjectionsDynamic(injections) {
  return !!injections._dynamic;
}
/**
 @Description 
Creating a hash using the arguments provided. Injections provided in the arguments are concatenated and validated. After validations injections are checked to be Singleton and then marked as dynamic. 
@private
returns {hash table}
*/
function buildInjections(/* container, ...injections */) {
  let hash = {};        // created a hash table
  if (arguments.length > 1) {   // if the length of argument is greater than 1 then set first element of  argument array as container
    let container = arguments[0];
    let injections = [];           //created a new array called injections
    let injection;
    for (let i = 1; i < arguments.length; i++) {
      if (arguments[i]) {
        injections = injections.concat(arguments[i]); // appending all the elements of the arguments array in injection array
      }
    }
    container.registry.validateInjections(injections);     // to validate the elements in injection array
    for (let i = 0; i < injections.length; i++) {
      injection = injections[i];   // mapping the returned look up value with the injection property.
      hash[injection.property] = lookup(container, injection.fullName);
      if (!isSingleton(container, injection.fullName)) {      // if it’s available then using the function isSingleton then marking the  injections as dynamic
        markInjectionsAsDynamic(hash);
      }
    }
  }
  return hash;
}

function factoryFor(container, fullName, options = {}) {
  let registry = container.registry;

  if (options.source) {
    fullName = registry.expandLocalLookup(fullName, options);
    // if expandLocalLookup returns falsey, we do not support local lookup
    if (!fullName) { return; }
  }

  let cache = container.factoryCache;
  if (cache[fullName]) {
    return cache[fullName];
  }
  let factory = registry.resolve(fullName);
  if (factory === undefined) { return; }

  let type = fullName.split(':')[0];
  if (!factory || typeof factory.extend !== 'function' || (!ENV.MODEL_FACTORY_INJECTIONS && type === 'model')) {
    if (factory && typeof factory._onLookup === 'function') {
      factory._onLookup(fullName);
    }

    // TODO: think about a 'safe' merge style extension
    // for now just fallback to create time injection
    cache[fullName] = factory;
    return factory;
  } else {
    let injections = injectionsFor(container, fullName);
    let factoryInjections = factoryInjectionsFor(container, fullName);
    let cacheable = !areInjectionsDynamic(injections) && !areInjectionsDynamic(factoryInjections);

    factoryInjections._toString = registry.makeToString(factory, fullName);

    let injectedFactory = factory.extend(injections);

    // TODO - remove all `container` injections when Ember reaches v3.0.0
    injectDeprecatedContainer(injectedFactory.prototype, container);
    injectedFactory.reopenClass(factoryInjections);

    if (factory && typeof factory._onLookup === 'function') {
      factory._onLookup(fullName);
    }

    if (cacheable) {
      cache[fullName] = injectedFactory;
    }

    return injectedFactory;
  }
}

function injectionsFor(container, fullName) {
  let registry = container.registry;
  let splitName = fullName.split(':');
  let type = splitName[0];

  let injections = buildInjections(container,
                                   registry.getTypeInjections(type),
                                   registry.getInjections(fullName));
  injections._debugContainerKey = fullName;

  setOwner(injections, container.owner);

  return injections;
}

function factoryInjectionsFor(container, fullName) {
  let registry = container.registry;
  let splitName = fullName.split(':');
  let type = splitName[0];

  let factoryInjections = buildInjections(container,
                                          registry.getFactoryTypeInjections(type),
                                          registry.getFactoryInjections(fullName));
  factoryInjections._debugContainerKey = fullName;

  return factoryInjections;
}

function instantiate(container, fullName) {
  let factory = factoryFor(container, fullName);
  let lazyInjections, validationCache;

  if (container.registry.getOption(fullName, 'instantiate') === false) {
    return factory;
  }

  if (factory) {
    if (typeof factory.create !== 'function') {
      throw new Error(`Failed to create an instance of '${fullName}'. Most likely an improperly defined class or` +
                      ` an invalid module export.`);
    }

    validationCache = container.validationCache;

    runInDebug(() => {
      // Ensure that all lazy injections are valid at instantiation time
      if (!validationCache[fullName] && typeof factory._lazyInjections === 'function') {
        lazyInjections = factory._lazyInjections();
        lazyInjections = container.registry.normalizeInjectionsHash(lazyInjections);

        container.registry.validateInjections(lazyInjections);
      }
    });

    validationCache[fullName] = true;

    let obj;

    if (typeof factory.extend === 'function') {
      // assume the factory was extendable and is already injected
      obj = factory.create();
    } else {
      // assume the factory was extendable
      // to create time injections
      // TODO: support new'ing for instantiation and merge injections for pure JS Functions
      let injections = injectionsFor(container, fullName);

      // Ensure that a container is available to an object during instantiation.
      // TODO - remove when Ember reaches v3.0.0
      // This "fake" container will be replaced after instantiation with a
      // property that raises deprecations every time it is accessed.
      injections.container = container._fakeContainerToInject;
      obj = factory.create(injections);

      // TODO - remove when Ember reaches v3.0.0
      if (!Object.isFrozen(obj) && 'container' in obj) {
        injectDeprecatedContainer(obj, container);
      }
    }

    return obj;
  }
}

// TODO - remove when Ember reaches v3.0.0
function injectDeprecatedContainer(object, container) {
  Object.defineProperty(object, 'container', {
    configurable: true,
    enumerable: false,
    get() {
      deprecate('Using the injected `container` is deprecated. Please use the `getOwner` helper instead to access the owner of this object.',
                false,
                { id: 'ember-application.injected-container', until: '3.0.0', url: 'http://emberjs.com/deprecations/v2.x#toc_injected-container-access' });
      return this[CONTAINER_OVERRIDE] || container;
    },

    set(value) {
      deprecate(
        `Providing the \`container\` property to ${this} is deprecated. Please use \`Ember.setOwner\` or \`owner.ownerInjection()\` instead to provide an owner to the instance being created.`,
        false,
        { id: 'ember-application.injected-container', until: '3.0.0', url: 'http://emberjs.com/deprecations/v2.x#toc_injected-container-access' }
      );

      this[CONTAINER_OVERRIDE] = value;

      return value;
    }
  });
}

function eachDestroyable(container, callback) {
  let cache = container.cache;
  let keys = Object.keys(cache);

  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    let value = cache[key];

    if (container.registry.getOption(key, 'instantiate') !== false) {
      callback(value);
    }
  }
}

function resetCache(container) {
  eachDestroyable(container, (value) => {
    if (value.destroy) {
      value.destroy();
    }
  });

  container.cache.dict = dictionary(null);
}

function resetMember(container, fullName) {
  let member = container.cache[fullName];

  delete container.factoryCache[fullName];

  if (member) {
    delete container.cache[fullName];

    if (member.destroy) {
      member.destroy();
    }
  }
}
