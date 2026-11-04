# Manual prompts — Feature 1 multilingual memory, quality check

Type these prompts in Claude Code (Nexpath already installed) and tick each result. Sentences are the
AI-written sample sentences (`multilingual-memory.json`); the non-Indian ones are not checked by a native
speaker yet.

---

## How to read the results

- **Popup:** when Nexpath helps with a prompt, its popup has a **“Context and constraints”** section. A
  memory that is “brought back” appears there.
- **No popup at all** for a prompt = Nexpath judged the prompt clear enough. That is **not** a memory
  failure; note “no popup” and move on (or send the same prompt in a new session).
- **What is saved:** run this any time, in the project folder (read-only, never changes anything):
  ```
  node /media/dhruv/newDisk/yagnik/v2/scripts/show-memory.mjs .
  ```
  It lists the active facts (🔒 = locked), replaced facts, MemOS summaries and the memory folders.
- **One folder per scenario / language** (e.g. `mkdir -p ~/ml-test/hi && cd ~/ml-test/hi && git init -q && claude`).
- **Why one per language:** The same decision in two languages is *one* decision: the newer one
  replaces the older one (that is correct, see Q4). So every language gets its own folder.
- **Order matters:** each fact is shown **once per session**. Always send the **unrelated** prompt
  **before** the related one, or the related prompt has already used the fact up.
- After each **teach** prompt, wait for Claude's reply to finish (the Stop hook saves the decision).

---

## The language scenarios

In each folder: open `claude`, then type a → b → c in the **same session**. After **a**, run `show-memory` to see it saved.

### Q1 — The 5 main forms

#### 1. English — folder `~/ml-test/en`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Locked requirement: processRetry in src/payments/retry.ts is the only entry point for payment retries.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `make the footer links a lighter grey` | Popup (if any) does **not** contain the decision |
| c. Related | `add a retry when the checkout payment fails` | Popup “Context and constraints” **contains** the decision |

#### 2. Hindi (Devanagari) — folder `~/ml-test/hi`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `यह final decision है: payment retry के लिए सिर्फ़ processRetry ही entry point रहेगा, इसे बदलना नहीं है।` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `footer के links का रंग थोड़ा हल्का करो` | Popup (if any) does **not** contain the decision |
| c. Related | `checkout पर payment fail होने पर दोबारा try करने का code जोड़ो` | Popup “Context and constraints” **contains** the decision |

#### 3. Hinglish — folder `~/ml-test/hi-latn`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Ye final hai: payment retry ke liye sirf processRetry hi entry point rahega, isko change mat karna.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `footer ke links ka color thoda light karo` | Popup (if any) does **not** contain the decision |
| c. Related | `checkout pe payment fail ho to retry wala code add karo` | Popup “Context and constraints” **contains** the decision |

#### 4. Gujarati (script) — folder `~/ml-test/gu`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `આ final છે: payment retry માટે ફક્ત processRetry જ entry point રહેશે, આ બદલવાનું નથી.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `footer ની links નો રંગ થોડો આછો કરો` | Popup (if any) does **not** contain the decision |
| c. Related | `checkout પર payment fail થાય તો ફરી try કરવાનો code ઉમેરો` | Popup “Context and constraints” **contains** the decision |

#### 5. Gujlish — folder `~/ml-test/gu-latn`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Aa final che: payment retry mate fakt processRetry j entry point rahese, aa badalvanu nahi.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `footer ni links no color thodo light karo` | Popup (if any) does **not** contain the decision |
| c. Related | `checkout par payment fail thay to retry valo code umero` | Popup “Context and constraints” **contains** the decision |

### Q2 — The 8 goal languages

> Not checked by a native speaker yet (AI-written sentences).

#### 6. American English slang — folder `~/ml-test/en-US-slang`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Heads up, processRetry is the only door for payment retries, that's final no cap.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `make the footer links way lighter, they look kinda heavy` | Popup (if any) does **not** contain the decision |
| c. Related | `yo, can we just slap a quick retry on checkout when the charge fails?` | Popup “Context and constraints” **contains** the decision |

#### 7. Latin American Spanish — folder `~/ml-test/es-419`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Ojo: processRetry es el único punto de entrada para reintentar pagos, ya está decidido.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `pon los links del footer en un gris más clarito` | Popup (if any) does **not** contain the decision |
| c. Related | `agrega un reintento cuando falle el pago en el checkout` | Popup “Context and constraints” **contains** the decision |

#### 8. Brazilian Portuguese — folder `~/ml-test/pt-BR`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Já está decidido: processRetry é o único ponto de entrada para retentativas de pagamento.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `deixa os links do rodapé num cinza mais claro` | Popup (if any) does **not** contain the decision |
| c. Related | `coloca uma retentativa quando o pagamento falhar no checkout` | Popup “Context and constraints” **contains** the decision |

#### 9. Nigerian Pidgin — folder `~/ml-test/pcm`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Abeg, na only processRetry be the door for payment retry, na final be that.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `make the footer links colour light small` | Popup (if any) does **not** contain the decision |
| c. Related | `make una add retry when payment fail for checkout` | Popup “Context and constraints” **contains** the decision |

#### 10. Sheng — folder `~/ml-test/sw-sheng`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Bana, processRetry ndio njia pekee ya retry ya payment, hii ni final.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `footer links ziwe na rangi lighter kidogo` | Popup (if any) does **not** contain the decision |
| c. Related | `weka retry payment ikifail kwa checkout` | Popup “Context and constraints” **contains** the decision |

#### 11. Swahili — folder `~/ml-test/sw`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `Ni uamuzi wa mwisho: processRetry ndiyo njia pekee ya kujaribu tena malipo.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `fanya viungo vya footer viwe na rangi nyepesi zaidi` | Popup (if any) does **not** contain the decision |
| c. Related | `ongeza kujaribu tena malipo yanaposhindwa wakati wa checkout` | Popup “Context and constraints” **contains** the decision |

#### 12. Hausa — folder `~/ml-test/ha`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `An yanke shawara: processRetry ne kaɗai hanyar sake gwada biyan kuɗi, kada a canza.` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `sa launin links na footer ya yi haske kaɗan` | Popup (if any) does **not** contain the decision |
| c. Related | `ƙara retry idan biyan kuɗi ya gaza a checkout` | Popup “Context and constraints” **contains** the decision |

#### 13. Amharic — folder `~/ml-test/am`

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach | `የመጨረሻ ውሳኔ ነው፦ ለክፍያ retry ብቸኛው መግቢያ processRetry ነው፤ አትቀይሩት።` | Agent replies. `show-memory` → 1 active fact, 🔒 locked, kind `rule` |
| b. Unrelated | `የfooter links ቀለም ትንሽ ቀለል አድርጉ` | Popup (if any) does **not** contain the decision |
| c. Related | `checkout ላይ ክፍያ ሲከሽፍ retry ጨምሩ` | Popup “Context and constraints” **contains** the decision |

---

### Q3 — A prompt in another form brings it back (folder `~/ml-test/cross`)

Teach all three first, then ask the three prompts. (2 of 3 found is the measured result; the Hindi
prompt for the Gujlish memory was missed in the automated run.)

| Step | Type this prompt | Expected |
|---|---|---|
| a. Teach (English) | `Locked requirement: processRetry in src/payments/retry.ts is the only entry point for payment retries.` | saved, 🔒 |
| b. Teach (Hinglish) | `Final hai: image upload ki limit 5 MB hai, isko change mat karna.` | saved, 🔒 |
| c. Teach (Gujlish) | `Aa final che: login token 15 minute pachi expire thase, badalvanu nahi.` | saved, 🔒 |
| d. Ask in Hinglish | `checkout pe payment fail ho to retry add karo` | the English processRetry decision |
| e. Ask in Gujarati | `users ને મોટા photo upload કરવા દો` | the Hinglish 5 MB decision |
| f. Ask in Hindi | `session को लंबा कर दो, users logout हो रहे हैं` | the Gujlish 15-minute decision (may be missed — record it) |

---

### Q4 — A newer decision replaces the older one

**Hindi, folder `~/ml-test/chain-hi`**

| Step | Type this prompt | Expected |
|---|---|---|
| a. Old decision | `पक्का नियम: processRetry सिर्फ़ 3 बार retry करेगा।` | saved, 🔒 |
| b. New decision | `पक्का नियम: processRetry अब 5 बार retry करेगा।` | `show-memory`: the new one active, the old one under **Replaced** |
| c. Ask (new session: `/clear` or restart `claude`) | `processRetry कितनी बार retry करता है` | popup shows **5 बार**, never **3 बार** |

**Gujarati, folder `~/ml-test/chain-gu`**

| Step | Type this prompt | Expected |
|---|---|---|
| a. Old decision | `પાકો નિયમ: processRetry માં ફક્ત ત્રણ વાર ફરી પ્રયાસ થશે.` | saved, 🔒 |
| b. New decision | `પાકો નિયમ: processRetry માં હવે ફક્ત પાંચ વાર ફરી પ્રયાસ થશે.` | new active, old **Replaced** |
| c. A different rule on the same function | `પાકો નિયમ: processRetry ના logs માં card number ક્યારેય ન આવવો જોઈએ.` | **both** stay active (different subject, nothing replaced) |
| d. Ask (new session) | `processRetry કેટલી વાર ફરી પ્રયાસ કરે છે` | popup shows **પાંચ વાર**, never **ત્રણ વાર** |

---

### Q5 — Lock words inside a question are not saved (folder `~/ml-test/questions`)

| Type this prompt | Expected (`show-memory` after each) |
|---|---|
| `kya ye final hai ki deploy sirf Tuesday ko hoga?` | no new rule |
| `ye final hai kya` | no new rule |
| `क्या यह पक्का फ़ैसला है कि deploy सिर्फ़ मंगलवार को होगा?` | no new rule |
| `shu aa final che ke deploy fakt Tuesday e j thase` | no new rule |
| `શું આ final છે?` | no new rule |
| `¿ya está decidido el deploy de los martes?` | no new rule |

And look-alike words that are **not** lock words:

| Type this prompt | Expected |
|---|---|
| `vamos a finalizar el pago` | no rule |
| `finally the test passed` | no rule |
| `es definitivamente mejor usar Postgres` | no rule |

---

### Q6 — Softer “don't change it” words (folder `~/ml-test/soft`)

Same rule as English today: “never …” / “don't touch that” alone in a prompt is **not** saved as a
rule (only clear decision words are). This scenario confirms that nothing unexpected is saved.

| Type this prompt | Expected |
|---|---|
| `Card number no go ever enter payment logs, no touch am.` | no rule from the prompt (a MemOS summary may appear ~30 s later — that is fine, unlocked) |
| `isko change mat karna, retry 3 baar hi rahega` | no locked rule from the prompt |

---

### Q7 — The same Hindi prompt twice is not shown back as a memory (folder `~/ml-test/echo`)

| Step | Type this prompt | Expected |
|---|---|---|
| a | `मुझे checkout के बटन का रंग नीला करना है` | agent replies |
| b | wait 30 s, then send the **same** prompt again | the popup does **not** list your own earlier prompt as a memory |

---

### Q8 — MemOS summaries stay in your language (needs the key; folder `~/ml-test/summary`)

No lock words here, so our own extractor saves nothing and MemOS's summary is the new fact.

| Step | Type this prompt | Expected (`show-memory` ~30–60 s after the reply) |
|---|---|---|
| a. Hinglish | `chalo rate limiting ke liye Redis use karte hai, har API key pe 100 requests per minute` | a **[MemOS summary]** in Hinglish (Latin letters, words like *se, har, pe*), **not** English, **not** Devanagari |
| b. Gujarati (folder `~/ml-test/summary-gu`) | `ચાલો rate limiting માટે Redis વાપરીએ, દરેક API key માટે મિનિટ દીઠ 100 requests` | a **[MemOS summary]** in Gujarati script |

---

### Q9 — Two Gujarati rules never overwrite each other (folder `~/ml-test/two-gu`)

| Step | Type this prompt | Expected |
|---|---|---|
| a | `આ final છે: payment retry માટે ફક્ત processRetry જ entry point રહેશે, આ બદલવાનું નથી.` | saved, 🔒 |
| b | `આ final છે: deploy ફક્ત મંગળવારે જ થશે.` | `show-memory`: **2** active facts (before V2 #7 the second replaced the first) |
| c. new session | `આજે શુક્રવાર છે, નવું release અત્યારે production પર મૂકી દો` | popup shows the **Tuesday-deploy** rule |
| d. new session | `checkout માં payment fail થાય તો retry ઉમેરો` | popup shows the **processRetry** rule |

---

### Q10 — English still works as before (folder `~/ml-test/english`)

| Step | Type this prompt | Expected |
|---|---|---|
| a | `Final decision: the API keys are read only from environment variables, never hard-coded.` | saved, 🔒 |
| b | `make the footer links a lighter grey` | popup (if any) does **not** contain the API-key rule |
| c | `add the Stripe API key to the config file` | popup **contains** the API-key rule |
| d | `Final decision: API keys now come from the secrets manager, not environment variables.` | old rule **Replaced** |
| e. new session | `where do we read the API keys from` | shows **secrets manager**, never the old rule |

---

## Result sheet

| Scenario | Pass / Fail / No popup | Notes |
|---|---|---|
| Q1 English · Hindi · Hinglish · Gujarati · Gujlish | | |
| Q2 US slang · Spanish · Portuguese · Pidgin · Sheng · Swahili · Hausa · Amharic | | |
| Q3 another form (d / e / f) | | |
| Q4 replace (Hindi / Gujarati) | | |
| Q5 questions + look-alikes | | |
| Q6 softer words | | |
| Q7 repeated Hindi prompt | | |
| Q8 summaries in your language | | |
| Q9 two Gujarati rules | | |
| Q10 English | | |
