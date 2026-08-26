/**
 * The panel command validator — the security gate every page-originated PE
 * command passes through twice (injector-side before sending, SW-side before
 * the mailbox). Exhaustive over the command union: every legal variant
 * accepted, every near-miss (missing payloads, junk enums, forged types)
 * refused.
 */
import { describe, expect, it } from 'vitest';
import { isPePanelCommandV1 } from './pe-contract.js';

describe('isPePanelCommandV1 — accepts exactly the command union', () => {
  const VALID: ReadonlyArray<[string, unknown]> = [
    ['use_current', { type: 'use_current', bodyText: 'b' }],
    ['use_original', { type: 'use_original' }],
    ['apply_details', { type: 'apply_details', bodyText: 'b', detailsText: 'd' }],
    ['shorter', { type: 'shorter', bodyText: 'b' }],
    ['more_thorough', { type: 'more_thorough', bodyText: 'b' }],
    ['more_project_grounded', { type: 'more_project_grounded', bodyText: 'b' }],
    ['go_back', { type: 'go_back' }],
    ['close', { type: 'close' }],
    ['feedback not_relevant_enough', { type: 'feedback_suggested', category: 'not_relevant_enough' }],
    ['feedback too_much_or_too_long', { type: 'feedback_suggested', category: 'too_much_or_too_long' }],
    ['edit_body', { type: 'edit_body', bodyText: 'b' }],
    ['mps_send', { type: 'mps_send', bodyText: 'b' }],
    ['mps_decline', { type: 'mps_decline' }],
    ['mps_cancel', { type: 'mps_cancel' }],
  ];
  for (const [name, value] of VALID) {
    it(`accepts ${name}`, () => { expect(isPePanelCommandV1(value)).toBe(true); });
  }

  const INVALID: ReadonlyArray<[string, unknown]> = [
    ['null', null],
    ['non-object', 'use_current'],
    ['unknown type', { type: 'launch_missiles' }],
    ['use_current without bodyText', { type: 'use_current' }],
    ['use_current with non-string bodyText', { type: 'use_current', bodyText: 7 }],
    ['apply_details without detailsText', { type: 'apply_details', bodyText: 'b' }],
    ['edit_body without bodyText', { type: 'edit_body' }],
    ['mps_send without bodyText', { type: 'mps_send' }],
    ['feedback without category', { type: 'feedback_suggested' }],
    ['feedback with junk category', { type: 'feedback_suggested', category: 'loved_it' }],
    ['feedback with free text as category', { type: 'feedback_suggested', category: 'the body was wrong about auth' }],
    ['type as non-string', { type: 3 }],
  ];
  for (const [name, value] of INVALID) {
    it(`refuses ${name}`, () => { expect(isPePanelCommandV1(value)).toBe(false); });
  }
});
