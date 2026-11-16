# Desktop app — Feature 1 manual test (context + tools)

Fire these prompts in the desktop app and check the popup. Each step names the part being tested:
**Map** (Feature 1's own memory), **MemOS**, **Code** (codebase-memory-mcp), **Meaning** (meaning search),
**OpenClaw**, **Languages**.

## Before you start

1. The desktop app uses the staging package (merge `1e60b075` or newer) and calls
   `prepareNexpathWriterEnhancement` with `tools` (same popup as the CLI).
2. Create a small test project and open it in the desktop app as the workspace:

   ```bash
   mkdir -p ~/f1-desktop-test/src/payments && cd ~/f1-desktop-test && git init -q
   cat > src/payments/retry.ts <<'EOF'
   export async function processRetry(paymentId: string) {
     // retries a failed payment
   }
   EOF
   cat > src/checkout.ts <<'EOF'
   import { processRetry } from './payments/retry';
   export async function completeCheckout(paymentId: string) {
     await processRetry(paymentId);
   }
   EOF
   cat > src/tax.ts <<'EOF'
   export function calculateTax(cart: { items: { price: number }[] }) {
     return cart.items.reduce((sum, i) => sum + i.price * 0.18, 0);
   }
   EOF
   git add -A && git commit -qm init
   ```
3. Send the prompts **in order**. After each **Teach** prompt, wait until the agent has replied.
4. **Each fact is shown once per session.** Send every **Unrelated** prompt before its **Related** one.

## How to read the result

- ✅ **Pass:** the popup contains the expected memory (usually under **"Context and constraints"**; errors under
  **"Risk, safety and confirmation"**; other facts under **"Project facts"**).
- ⚪ **No popup:** Nexpath judged the prompt clear enough. Not a memory failure: note it.
- ❌ **Fail:** a popup without the expected memory, or an Unrelated prompt that shows a memory.

---

## D1 — Map: a locked decision comes back

| Step | Prompt | Expected in the popup |
|---|---|---|
| Teach | `Locked requirement: processRetry in src/payments/retry.ts is the only entry point for payment retries.` | — |
| Unrelated | `make the footer links a lighter grey` | no memory |
| Related | `add a retry when the checkout payment fails` | **processRetry is the only entry point** |

## D2 — Map: a replaced decision never comes back

| Step | Prompt | Expected in the popup |
|---|---|---|
| Teach (old) | `Final decision: API keys are read only from environment variables.` | — |
| Teach (new) | `Final decision: API keys now come from the secrets manager, not environment variables.` | — |
| Related (restart the app first = new session) | `add the Stripe API key to the config` | **secrets manager**, never "only from environment variables" |

## D3 — Map: a past error goes to the Risk section

| Step | Prompt | Expected in the popup |
|---|---|---|
| Teach | `Error: processRetry crashed with ECONNRESET when the payment gateway timed out.` | — |
| Related | `add a timeout to the payment gateway call` | under **Risk, safety and confirmation**: the **ECONNRESET crash** |

## D4 — MemOS: a decision said in normal words (no lock word) is learned

| Step | Prompt | Expected |
|---|---|---|
| Teach | `for rate limiting I think redis is better than memcached here, let's just go with redis, 100 requests per minute per API key` | — (wait **1 minute**: MemOS writes its summary in the background) |
| Unrelated | `add a dark mode toggle to the settings page` | no memory |
| Related | `add rate limiting to the public API` | **Redis, 100 requests per minute per API key** |

## D5 — Code: codebase-memory knows who calls a function

| Step | Prompt | Expected in the popup |
|---|---|---|
| Warm-up | `look at processRetry and tell me what it does` | (first prompt in the project starts the code index; may show nothing yet) |
| wait 30 s, then | `change processRetry to wait 2 seconds between attempts` | a code line like **"processRetry is a function defined in src/payments/retry.ts:1-3. It is called by completeCheckout (checkout)."** |
| Related | `calculateTax returns the wrong value for empty carts` | a code line like **"calculateTax is a function defined in src/tax.ts…"** |

## D6 — Meaning: found with no shared words

| Step | Prompt | Expected in the popup |
|---|---|---|
| Teach | `Handle Stripe webhooks idempotently by storing event ids in processed_events.` | — |
| Related | `stripe sends the same event again and customers are billed twice` | the **processed_events** rule |

## D7 — Languages: the same memory in other languages

Use a **new, empty project folder** for this step (`mkdir ~/f1-desktop-ml && cd ~/f1-desktop-ml && git init -q`).

| Step | Prompt | Expected in the popup |
|---|---|---|
| Teach (Hindi) | `पक्का फ़ैसला: login token 15 मिनट बाद expire होगा, इसे मत बदलना।` | — |
| Teach (Hinglish) | `Ye fix hai: DB me saari dates UTC me hi save hongi, local time me nahi.` | — |
| Teach (Gujlish) | `Aa final che: darek email sendMail queue thi j jase, SMTP ne direct call nahi karvanu.` | — |
| Unrelated (Hinglish) | `landing page ka logo badal do` | no memory |
| Related (Hindi) | `users बार-बार logout हो रहे हैं, session लंबा कर दो` | **15 minute** token |
| Related (Hinglish) | `order date user ke timezone me save karo` | **UTC** |
| Related (Gujlish) | `signup pachi welcome mail sidho mokli do` | **sendMail queue** |
| Cross-language (Hinglish → English memory from D1, back in `~/f1-desktop-test`) | `checkout pe payment fail ho to retry add karo` | **processRetry** |

## D8 — Questions are not saved

| Step | Prompt | Expected |
|---|---|---|
| Question | `kya ye final hai ki deploy sirf Tuesday ko hoga?` | — |
| Later (new session) | `deploy the new release today` | **no** "deploy only on Tuesday" memory |

## D9 — OpenClaw: session decisions are kept for later

| Step | Do | Expected |
|---|---|---|
| 1 | After D1–D3, **close the desktop app** (this ends the session) | — |
| 2 | Look in the app's Nexpath data folder (ask Ved for `dataDir`): `<dataDir>/openclaw/agents/*/workspace/memory/` | a file `…-session-….md` listing the decisions from D1–D3 |
| 3 | Reopen the app, same project: `where do we read the API keys from` | **secrets manager** |

## D10 — Stays quiet when nothing matches

| Prompt | Expected |
|---|---|
| `hello` | no popup, no memory |
| `what is the capital of France` | no memory |

---

## Result sheet

| Step | Part | Pass / Fail / No popup | Notes |
|---|---|---|---|
| D1 | Map | | |
| D2 | Map (replaced) | | |
| D3 | Map (Risk section) | | |
| D4 | MemOS | | |
| D5 | Code | | |
| D6 | Meaning | | |
| D7 | Languages | | |
| D8 | Questions | | |
| D9 | OpenClaw | | |
| D10 | Unrelated | | |

**If a whole part never works** (e.g. D5 always empty), the desktop app is probably not passing `tools` or
not packaging that tool (codebase-memory-mcp program, `onnxruntime-node`, OpenClaw with `openclawNodePath`).
Tell F1 which step failed and paste the popup text.
