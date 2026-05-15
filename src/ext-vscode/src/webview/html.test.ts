import { describe, it, expect } from 'vitest';
import { renderDecisionSessionHtml, escapeHtml } from './html.js';
import type { DecisionSessionPayload } from '../ipc.js';

const CSP_SRC = 'vscode-resource:fake-csp';
const FIXED_NONCE = 'test-nonce-deterministic';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('leaves harmless characters alone', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
    expect(escapeHtml('emoji 🚀 and unicode é')).toBe('emoji 🚀 and unicode é');
  });

  it('escapes injection attempts in the middle of strings', () => {
    expect(escapeHtml('hi <script>alert(1)</script>')).toBe(
      'hi &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });
});

describe('renderDecisionSessionHtml — empty state', () => {
  it('returns valid HTML with no payload', () => {
    const html = renderDecisionSessionHtml(null, { cspSource: CSP_SRC });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Nexpath is active');
    expect(html).toContain('Decision sessions will appear');
  });

  it('includes the CSP source in the empty-state HTML', () => {
    const html = renderDecisionSessionHtml(null, { cspSource: CSP_SRC });
    expect(html).toContain(CSP_SRC);
    expect(html).toContain("default-src 'none'");
  });

  it('does not include a script tag in the empty state (no scripts needed)', () => {
    const html = renderDecisionSessionHtml(null, { cspSource: CSP_SRC });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('acquireVsCodeApi');
  });
});

describe('renderDecisionSessionHtml — populated state', () => {
  const payload: DecisionSessionPayload = {
    advisory: 'Consider clarifying scope before continuing.',
    options: [
      { id: 'opt-a', label: 'Refine the request' },
      { id: 'opt-b', label: 'Proceed with caution' },
    ],
  };

  it('contains the advisory text', () => {
    const html = renderDecisionSessionHtml(payload, {
      cspSource: CSP_SRC,
      nonce: FIXED_NONCE,
    });
    expect(html).toContain('Consider clarifying scope before continuing.');
  });

  it('renders one button per option with the right label + numbering', () => {
    const html = renderDecisionSessionHtml(payload, {
      cspSource: CSP_SRC,
      nonce: FIXED_NONCE,
    });
    expect(html).toContain('1.');
    expect(html).toContain('2.');
    expect(html).toContain('Refine the request');
    expect(html).toContain('Proceed with caution');
    expect(html).toContain('data-option-id="opt-a"');
    expect(html).toContain('data-option-id="opt-b"');
    expect(html).toContain('data-option-label="Refine the request"');
  });

  it('includes the dismiss button + the message-passing script', () => {
    const html = renderDecisionSessionHtml(payload, {
      cspSource: CSP_SRC,
      nonce: FIXED_NONCE,
    });
    expect(html).toContain('id="dismiss"');
    expect(html).toContain('acquireVsCodeApi');
    expect(html).toContain("type: 'select'");
    expect(html).toContain("type: 'dismiss'");
  });

  it('uses the provided nonce in the CSP and on the script tag', () => {
    const html = renderDecisionSessionHtml(payload, {
      cspSource: CSP_SRC,
      nonce: FIXED_NONCE,
    });
    expect(html).toContain(`'nonce-${FIXED_NONCE}'`);
    expect(html).toContain(`<script nonce="${FIXED_NONCE}">`);
  });

  it('escapes HTML-significant characters in advisory and option labels', () => {
    const evilPayload: DecisionSessionPayload = {
      advisory: 'Watch out: <script>alert("xss")</script> & friends',
      options: [
        { id: '<a>', label: '<img src=x onerror=alert(1)>' },
      ],
    };
    const html = renderDecisionSessionHtml(evilPayload, {
      cspSource: CSP_SRC,
      nonce: FIXED_NONCE,
    });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-option-id="&lt;a&gt;"');
  });

  it('handles an empty options array without crashing', () => {
    const html = renderDecisionSessionHtml(
      { advisory: 'No options for you', options: [] },
      { cspSource: CSP_SRC, nonce: FIXED_NONCE },
    );
    expect(html).toContain('No options for you');
    expect(html).toContain('id="dismiss"');
    expect(html).toMatch(/<ul id="options">\s*<\/ul>/);
  });

  it('generates a fresh nonce when none is provided', () => {
    const a = renderDecisionSessionHtml(payload, { cspSource: CSP_SRC });
    const b = renderDecisionSessionHtml(payload, { cspSource: CSP_SRC });
    const noncePattern = /'nonce-([A-Za-z0-9]{32})'/;
    const aMatch = a.match(noncePattern);
    const bMatch = b.match(noncePattern);
    expect(aMatch).not.toBeNull();
    expect(bMatch).not.toBeNull();
    expect(aMatch![1]).not.toBe(bMatch![1]);
  });
});
