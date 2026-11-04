# Popup prompts — Feature 1 multilingual memory (manual check)

Check that the right memory appears in the Nexpath popup, in 13 languages.
Sentences are AI-written samples; the non-Indian ones are not checked by a native speaker yet.

## Before you start

- The system must run the **v2 build** of Nexpath (the old 0.1.57 build has no multilingual changes), with the OpenAI key set.
- Use **one new, empty project folder per group**: `mkdir ~/ml-A && cd ~/ml-A && git init && claude`.
- In **one Claude session**, send the prompts **in this order**: all **Teach** → all **Unrelated** → all **Related**
  (each fact is shown once per session, so unrelated must come first).
- After each Teach prompt, wait until Claude has finished replying.

## Results

- ✅ **Pass:** a Related prompt's popup (**“Context and constraints”**) contains its decision; Unrelated prompts show none.
- ⚪ **No popup:** Nexpath judged the prompt clear enough — not a memory failure; note it.
- ❌ **Fail:** the popup appears without the decision, or an Unrelated prompt shows a decision.

---

## Group A — folder `ml-A` (English, Hindi, Hinglish, Gujarati, Gujlish, US slang, Spanish, Portuguese)

### Step 1 — Teach (one by one)

1. English
```
Locked requirement: processRetry in src/payments/retry.ts is the only entry point for payment retries.
```
2. Hindi
```
पक्का फ़ैसला: login token 15 मिनट बाद expire होगा, इसे मत बदलना।
```
3. Hinglish
```
Ye fix hai: DB me saari dates UTC me hi save hongi, local time me nahi.
```
4. Gujarati
```
પાકો નિયમ: payment logs માં card number ક્યારેય ન આવવો જોઈએ, આ બદલવાનું નથી.
```
5. Gujlish
```
Aa final che: darek email sendMail queue thi j jase, SMTP ne direct call nahi karvanu.
```
6. US slang
```
We're locked in on Postgres, no cap, nobody's switching databases.
```
7. Spanish
```
Decisión final: el deploy solo se hace los martes.
```
8. Portuguese
```
É definitivo: upload de imagem tem limite de 5 MB, não mexam nisso.
```

### Step 2 — Unrelated (expected: no decision in the popup)

| # | Language | Prompt | Result |
|---|---|---|---|
| 1 | English | `make the footer links a lighter grey` | |
| 2 | Hindi | `settings page पर dark mode का बटन जोड़ो` | |
| 3 | Hinglish | `landing page ka logo badal do` | |
| 4 | Gujarati | `About page પરની spelling ભૂલ સુધારો` | |
| 5 | Gujlish | `sidebar thodi patli karo` | |
| 6 | US slang | `throw a tooltip on the export button` | |
| 7 | Spanish | `agranda la letra de los títulos` | |
| 8 | Portuguese | `coloca um spinner de carregamento no dashboard` | |

### Step 3 — Related (expected: the decision in the popup)

| # | Language | Prompt | Popup must mention | Result |
|---|---|---|---|---|
| 1 | English | `add a retry when the checkout payment fails` | **processRetry** | |
| 2 | Hindi | `users बार-बार logout हो रहे हैं, session लंबा कर दो` | **15 minute token** | |
| 3 | Hinglish | `order date user ke timezone me save karo` | **UTC** | |
| 4 | Gujarati | `payment fail થાય તો આખી card detail debug log માં print કરો` | **card number never in logs** | |
| 5 | Gujlish | `signup pachi welcome mail sidho mokli do` | **sendMail queue** | |
| 6 | US slang | `yo can we just move the orders over to Mongo real quick` | **Postgres** | |
| 7 | Spanish | `che, subamos la versión nueva a producción ahora, aunque sea viernes` | **deploy only on martes / Tuesday** | |
| 8 | Portuguese | `deixa os usuários subirem fotos de perfil maiores` | **5 MB limit** | |

---

## Group B — folder `ml-B` (Pidgin, Sheng, Swahili, Hausa, Amharic)

### Step 1 — Teach (one by one)

1. Pidgin
```
Abeg, na only processRetry be the door for payment retry, na final be that.
```
2. Sheng
```
Login token ina-expire baada ya dakika 15, hii ni final, msiibadilishe.
```
3. Swahili
```
Ni uamuzi wa mwisho: tarehe zote zinahifadhiwa kwa UTC kwenye database, si saa ya eneo.
```
4. Hausa
```
Wannan shi ne na ƙarshe: lambar kati kada ta taɓa shiga payment logs.
```
5. Amharic
```
የመጨረሻ ውሳኔ ነው፦ ሁሉም email በsendMail queue በኩል ይላካል፤ SMTP በቀጥታ አትጥሩ።
```

### Step 2 — Unrelated (expected: no decision in the popup)

| # | Language | Prompt | Result |
|---|---|---|---|
| 1 | Pidgin | `make the footer links colour light small` | |
| 2 | Sheng | `weka button ya dark mode kwa settings` | |
| 3 | Swahili | `badilisha nembo ya ukurasa wa mwanzo` | |
| 4 | Hausa | `gyara kuskuren rubutu a shafin About` | |
| 5 | Amharic | `sidebar ትንሽ ጠበብ አድርጉ` | |

### Step 3 — Related (expected: the decision in the popup)

| # | Language | Prompt | Popup must mention | Result |
|---|---|---|---|---|
| 1 | Pidgin | `make una add retry when payment fail for checkout` | **processRetry** | |
| 2 | Sheng | `users wanalogiwa out kila saa, session iwe ndefu` | **15 minute token** | |
| 3 | Swahili | `hifadhi tarehe ya oda kwa saa za eneo la mtumiaji` | **UTC** | |
| 4 | Hausa | `idan biyan kuɗi ya gaza, buga duk bayanan kati a debug log` | **card number never in logs** | |
| 5 | Amharic | `welcome email ከsignup በቀጥታ ላኩ` | **sendMail queue** | |

