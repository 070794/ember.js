import { computed } from 'ember-metal/computed';
import run from 'ember-metal/run_loop';
import jQuery from 'ember-views/system/jquery';
import EmberView from 'ember-views/views/view';
import { compile } from 'ember-template-compiler';

var view;

QUnit.module('Ember.View', {
  teardown() {
    run(function() {
      view.destroy();
    });
  }
});

QUnit.test('should add ember-view to views', function() {
  view = EmberView.create();

  run(function() {
    view.createElement();
  });

  ok(view.$().hasClass('ember-view'), 'the view has ember-view');
});

QUnit.test('should not add role attribute unless one is specified', function() {
  view = EmberView.create();

  run(function() {
    view.createElement();
  });

  ok(view.$().attr('role') === undefined, 'does not have a role attribute');
});

QUnit.test('should allow tagName to be a computed property [DEPRECATED]', function() {
  view = EmberView.extend({
    tagName: computed(function() {
      return 'span';
    })
  }).create();

  expectDeprecation(function() {
    run(function() {
      view.createElement();
    });
  }, /using a computed property to define tagName will not be permitted/);

  equal(view.element.tagName, 'SPAN', 'the view has was created with the correct element');

  run(function() {
    view.set('tagName', 'div');
  });

  equal(view.element.tagName, 'SPAN', 'the tagName cannot be changed after initial render');
});

import { test } from 'internal-test-helpers/tests/skip-if-glimmer';

test('should re-render if the context is changed', function() {
  view = EmberView.create({
    elementId: 'template-context-test',
    context: { foo: 'bar' },
    template: compile('{{foo}}')
  });

  run(function() {
    view.appendTo('#qunit-fixture');
  });

  equal(jQuery('#qunit-fixture #template-context-test').text(), 'bar', 'precond - renders the view with the initial value');

  run(function() {
    view.set('context', {
      foo: 'bang baz'
    });
  });

  equal(jQuery('#qunit-fixture #template-context-test').text(), 'bang baz', 're-renders the view with the updated context');
});
