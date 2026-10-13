'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = path.resolve(__dirname, '../../extension/content');
const read = (file) => fs.readFileSync(path.join(content, file), 'utf8');
const picker = read('element-picker.js').replace(/\r\n/g, '\n');
const a = picker.indexOf('  function isPickerNode(node)');
const b = picker.indexOf('  function getUniqueSelector(', a);
assert(a >= 0 && b > a, 'missing picker target contract');
class FakeElement {
  constructor(id, parent = null, internal = false) {
    this.id = id;
    this.parentElement = parent;
    this.internal = internal;
  }
  closest(selector) {
    for (let elem = this; elem; elem = elem.parentElement) {
      if (elem.internal && selector.includes('data-shield-internal')) return elem;
      if (elem.id?.startsWith('__element_picker_') && selector.includes('__element_picker_')) return elem;
    }
    return null;
  }
}
const context = { Element: FakeElement };
vm.runInNewContext(picker.slice(a, b) + '\nglobalThis.testPicker = isPickerNode;', context);
const site = new FakeElement('site-div');
const own = new FakeElement('__element_picker_confirm__', null, true);
const ownChild = new FakeElement('confirm-button', own);
assert.equal(context.testPicker(site), false, 'website target remains selectable');
assert.equal(context.testPicker(own), true, 'picker UI is internal');
assert.equal(context.testPicker(ownChild), true, 'picker nested UI is internal');
assert(picker.includes('return document.documentElement;'), 'picker must mount outside page body');
assert(picker.includes('if (!(target instanceof HTMLElement) || isPickerNode(target)) return;'),
  'picker may not block its own controls');
const cosmetic = read('cosmetic-filter.js');
assert(cosmetic.includes(':not(html):not(body):not([data-shield-internal="true"])'),
  'cosmetic rules must preserve root and internal UI');
const staticCss = read('player-overlay-fix.css');
assert(!staticCss.includes('div[id^="preact"]'), 'must not suppress ordinary Preact roots');
assert(!staticCss.includes('[class*="popup-overlay"]'), 'must not suppress generic site popups');
const antiPopup = read('anti-popup.js');
assert(antiPopup.includes('const hasAdSignal = '), 'must require an explicit ad signal');
assert(antiPopup.includes('!isDialog && hasAdSignal'), 'must protect site dialogs');
console.log('element isolation / self-block regression passed');
