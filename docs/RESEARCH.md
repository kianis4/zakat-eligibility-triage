# Zakat-Eligibility Triage for Crowdfunding Campaigns: Research Grounding

**Status:** research grounding for an engineering prototype
**Compiled:** 19 August 2026
**Scope:** evidence assembly for a human reviewer. This project does **not** issue religious
rulings, and this document does **not** adjudicate between schools of Islamic law.

## How to read this

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | From a primary source fetched and read directly, with URL. |
| **[REPORTED]** | Secondary source. Plausible, not confirmed against a primary. |
| **[INFERENCE]** | Synthesis or engineering judgment. Not a fact about the world, and explicitly not a fiqh claim. |

The author is not a scholar of Islamic law. Where scholars differ, the aim is to document the
disagreement accurately and leave it open. Section 2 is a literature map, not a fiqh position,
and should be reviewed by a qualified reader before this repository is relied upon.

---

## 1. LaunchGood's product surface today

### 1.1 The designation already exists

**[VERIFIED]** LaunchGood operates a **"Zakat-verified" badge** and a published **Zakat Policy**,
last updated **24 February 2025**: [launchgood.com/zakatpolicy](https://www.launchgood.com/zakatpolicy)
([archived 11 Oct 2025](https://web.archive.org/web/20251011233542/https://www.launchgood.com/zakatpolicy)).

> "This rigorous verification process ensures that only those fundraisers aimed at these specific
> Shari'ah-compliant recipients receive the 'Zakat-verified' badge."

**[VERIFIED]** Donor-facing: a "Z" badge on the campaign thumbnail and a "Zakat-verified" badge
under the Donate button, plus a collection page at
[/communitypage/zakat_verified](https://www.launchgood.com/communitypage/zakat_verified).

### 1.2 How a campaign earns it

**[VERIFIED]** Organizer **self-declares first, then is reviewed**. In the Enhance section the
organizer selects "Yes, this campaign is Zakat eligible" and picks a category; "Your campaign will
then be verified by our team of compliance Zakat experts according to LaunchGood's Zakat Policy."
([support article](https://support.launchgood.com/support/solutions/articles/35000178116-how-does-my-campaign-get-verified-for-zakat-eligibility-))

**[VERIFIED]** Self-badging is prohibited: organizers adding their own badge "may be subject to deletion."

**[VERIFIED]** LaunchGood publishes **what evidence helps**, the single most directly relevant fact
for this project. Its FAQ gives examples: "In which country is the beneficiary orphan being
sponsored?", "What is the amount of the medical loan?", "Who is the specific audience for the dawah
initiative?"

**[VERIFIED]** Mixed-purpose campaigns are handled by **disclosure wording, not rejection**. Template:
"All Zakat donations will go to [X]. All other donations will go towards [Y] as Sadaqah." Campaigns
using it "will be marked as Zakat-verified."

### 1.3 Who reviews, and the load-bearing disclaimer

**[VERIFIED]** Two distinct groups. **The reviewers**: "our Zakat team" / "team of compliance and
Zakat experts", with no names, credentials or headcount published. **The scholars**: policy positions
"researched and compiled by Shaykh Omar Baig" and checked by four madhab reviewers (Mufti
Wahajuddin, Hanafi; Shaykh Ma'an Dabbaagh, Maliki; Shaykh Ibrahim Khidr, Shafi'i; Shaykh Abdullah
Ashraf, Hanbali).

**[VERIFIED] This determines where the tool belongs:**

> "The scholars mentioned above reviewed the definitions of each category based on their respective
> madhab. **However, they do not participate in the actual verification process.**"

**[INFERENCE]** The scholarly work is front-loaded into a written policy; per-campaign decisions are
made by an operations team applying that policy at volume. That is precisely the layer where evidence
assembly, span citation and precedent retrieval help, and it is why the tool must produce material
for a *policy-applier*, not attempt scholarly reasoning already done upstream.

**[VERIFIED] Not published:** turnaround time; any appeal path (the non-eligibility support article
describes none, directing questions to zakat@launchgood.com); required documentation; volume or
approval rates.

### 1.4 The donor toggles, the most important product fact here

**[VERIFIED]** LaunchGood does not resolve scholarly disagreement into one verdict. It pushes the
contested part to the donor:

> "Since there is a difference of opinion on the definition and eligibility of certain recipients,
> users can select to toggle on/off any group of recipients regarding which there is a difference of
> opinion."

| Toggle | LaunchGood's stated basis |
|---|---|
| Poor and Needy | "Valid recipients according to all classical and contemporary scholars" |
| Community Welfare | "Valid recipients according to many contemporary interpretations" |
| New Muslims | "Valid according to Shafi'is, Hanbalis, and many contemporary interpretations" |
| Religious Support | "Valid recipients according to many contemporary interpretations" |
| Non-Muslims | "Valid according to Malikis, Hanbalis and many contemporary interpretations" |

**[INFERENCE] "Zakat-verified" is not a binary.** It is a verified mapping onto a *labelled* recipient
class which the donor then accepts or filters by their own school. **A tool emitting a single
eligible/ineligible bit is modelling the wrong output type.** The correct output is
`(category assignment, supporting evidence, contested-ness)`.

**[NOT ESTABLISHED]** The mapping from these five toggles to the eight Qur'anic categories is not
published, nor is the organizer-facing category dropdown. Any mapping is reconstruction.

### 1.5 Scale and seasonality

**[VERIFIED, with an internal inconsistency]** LaunchGood's About page says "over $450m from 1.5m
donors"; [Wikipedia](https://en.wikipedia.org/wiki/LaunchGood) cites that same page for "$688 million
from 2.1 million donors" across 155 countries. **These disagree and could not be reconciled.** Do not
quote a precise number to LaunchGood, who know the real one.

**[VERIFIED] Seasonality, the strongest operational argument for the project.** From LaunchGood's own
[Ramadan 1443 Giving Report](https://blog.launchgood.com/posts/launchgood-ramadan-giving-report-insights-trends)
(29 Mar 2022, on the prior Ramadan):

- 1.05 million donations raising over $47 million in Ramadan.
- The 30 days of Ramadan raised close to what the other 11 months raised combined.
- **78% of Zakat donations came inside Ramadan.**
- 591,642 sessions/month outside Ramadan vs **4,026,353 sessions in the 30 days**, 62% of the year.
- Last ten days: 27% higher average funds raised per campaign than the first twenty.

**Caveat [VERIFIED]:** this report is four years old. It is the most recent first-party data found.

**[INFERENCE]** ~78% of a year's zakat review load inside a 30-day window, concentrated further into
the last ten nights, is a **queueing problem before it is an AI problem**. Value here is throughput
and consistency under a spike, not replacing judgment. Evaluation must therefore include
latency-under-load, not only accuracy.

---

## 2. The eight categories (asnaf) of Qur'an 9:60

> Section 2 is a literature map compiled by a non-specialist from English-language institutional
> sources. It has **not** been checked against Arabic primary sources. A qualified reviewer should
> read it before this repository is shown to anyone. See Open Question 11.

### 2.1 The canonical list

| # | Arabic | Common English |
|---|---|---|
| 1 | *al-fuqara'* | the poor / destitute |
| 2 | *al-masakin* | the needy |
| 3 | *al-'amilin 'alayha* | zakat collectors / administrators |
| 4 | *al-mu'allafah qulubuhum* | those whose hearts are to be reconciled |
| 5 | *fi'r-riqab* | those in bondage |
| 6 | *al-gharimin* | the debt-ridden |
| 7 | *fi sabilillah* | in the path of Allah |
| 8 | *ibn al-sabil* | the wayfarer / stranded traveller |

**[VERIFIED] A parsing trap:** LaunchGood's policy lists the canonical eight, then **renumbers them**
in its operational section. A naive scrape produces an incorrect category index.

### 2.2 Per-category mapping, and where LaunchGood diverges from generic sources

**(1)(2) Poor and Needy.** **[VERIFIED: LaunchGood]** recipients must be Muslim and funds must go
**directly to the individual**: "unlike community projects (like building wells) that do not transfer
direct ownership." Ineligible example given: "Building a well that benefits a poor community but does
not transfer direct ownership to individuals."

**(3) Administrators.** **[VERIFIED]** "**LaunchGood does not verify campaigns that solely raise for
this category.**" **[INFERENCE]** High-value *detector*, not classifier: "this appears to raise for the
collecting organisation's own costs" is exactly what a human should see flagged.

**(4) Hearts to be Reconciled.** **[VERIFIED]** LaunchGood publishes the four-madhab split verbatim:
Hanafis consider it applicable only during the Prophet's lifetime; Malikis to non-Muslims who may be
encouraged toward Islam; Shafi'is to new Muslims; Hanbalis to both. **[INFERENCE]** The same campaign
is eligible under Maliki/Hanbali reasoning and inapplicable under Hanafi reasoning. The tool must
represent "eligible-under-X, not-under-Y."

**(5) Those in Bondage.** **[VERIFIED]** "this category no longer applies today." **[REPORTED]** Some
contemporary scholars extend it to trafficking or bonded labour. LaunchGood does not. **[INFERENCE]** A
trafficking-survivor campaign is therefore routed via poor-and-needy; a generically-trained system
would mis-route it.

**(6) The Debt-Ridden.** **[VERIFIED]** Split in two: personal debt below nisab (verified under poor
and needy), and third-party debt, which "**LaunchGood does not verify due to difficulty confirming the
situation.**" **[INFERENCE] This is an evidentiary exclusion, not a doctrinal one**, and arguably the single
most useful distinction the tool can make legible, and it maps directly to a missing-evidence output.

**(7) In the Path of Allah, the genuinely contested one.** **[VERIFIED]** LaunchGood adopts the
contemporary view (citing Shaykh Yusuf Qaradawi), verifying campaigns that "alleviate poverty or
improve health for needy Muslims" or "promote Islamic interests in areas where Muslims are a minority
and in dire need." Eligible: "Building a water filtration system for a poor Muslim community."
Ineligible: "Funding military campaigns."

**[INFERENCE] Note the tension:** water filtration is *eligible* under fi sabilillah while a well is
*ineligible* under poor-and-needy. The distinguishing principle is the category invoked, not the
project type. **Any classifier keying on "infrastructure -> ineligible" is wrong about half the time.**

**[VERIFIED]** AMJA enumerates **five** positions on the scope of fi sabilillah
([amjaonline.org](https://www.amjaonline.org/zakat-eligibility-of-islamic-organizations)): fighters
only (majority of earlier scholars); all good causes (al-Qaffal, al-Razi, al-Kasani, grand shaykhs of
al-Azhar); financing obligatory Hajj (authorised Hanbali position); students of knowledge (many
Hanafis, Shafi'is, Hanbalis); all forms of jihad including da'wah (AMJA's adopted position, Islamic
Fiqh Council, Ibn Baz, al-Qaradawi).

**(8) The Wayfarer.** **[VERIFIED]** "**LaunchGood does not verify these fundraisers**," reasoning that
a stranded person able to create a campaign likely has fund access. **[REPORTED]** Islamic Relief by
contrast reads this category as covering **IDPs and refugees**
([islamic-relief.org/zakat-policy](https://islamic-relief.org/zakat-policy/)). **[INFERENCE]** A live
divergence between two major operators on the same category. How LaunchGood routes refugee campaigns
is unresolved (see Open Question 7).

### 2.3 The live 2026 dispute, and why "a human decides" is not a hedge

**[VERIFIED]** On **30 January 2026**, the **Fiqh Council of North America** and **AMJA's Resident
Fatwa Committee** jointly issued a fatwa permitting zakat for political campaigns influencing policy
on Gaza, resting on **al-mu'allafah al-qulub**, with five conditions including a suggested 1/8th cap.
Fifteen signatories including Dr. Yasir Qadhi, Dr. Muzammil Siddiqi, Dr. Hatem al-Haj.
([fiqhcouncil.org](https://fiqhcouncil.org/zakat-for-political-campaigns/)) The fatwa **itself records
internal dissent**.

**[VERIFIED]** **Darul Qasim College** rejected it outright, calling the position "a minuscule
minority" and the scholarship "flimsy and shoddy"
([darulqasim.org](https://darulqasim.org/statement-on-zakat/)).

**[INFERENCE] Three design consequences:**
1. **A category boundary moved within the last seven months.** Any hardcoded rule table or model with a
   training cutoff is a decaying asset. Category definitions must be **versioned external policy data**,
   and every output must stamp the policy version it was produced under.
2. A system that confidently classified a political-advocacy campaign in December 2025 would have been
   contradicted by a major fiqh body in January and another in February. **This is the strongest
   argument for never asserting a verdict.**
3. Both the fatwa and the dissent reason from evidence. A tool surfacing *which evidence is present* is
   useful to both camps; a tool picking a camp is useful to neither and offensive to one.

---

## 3. How verification is done operationally today

Across every operator examined, the same division of labour recurs.

**LaunchGood** (§1.2-1.3): self-declaration -> internal expert review against a published policy ->
badge or no badge -> no documented appeal.

**National Zakat Foundation (UK)**, the most transparent model found.
**[VERIFIED]** [Zakat Policy PDF](https://nzf.org.uk/wp-content/uploads/2023/03/Zakat-Policy-FV.pdf)
(Mufti Faraz Adam, Mar 2023). "NZF uses the Hanafi Fiqh criteria": one declared madhab, removing
ambiguity by policy fiat rather than by resolving it. The evidentiary standard is the key sentence:

> "The eligibility of a person is established based on the principle that Grants Officers observe
> **sufficient evidence to believe** that the applicant is eligible. This is the standard expected in
> the texts of Sacred Law **to maintain the dignity of applicants**."

**[INFERENCE] This is the design north star.** It is explicitly not a proof standard, and the reason is
**dignitary, not epistemic**: demanding exhaustive proof from a poor person is itself a harm. Therefore
the tool must not maximise evidence extraction; "missing evidence" must be short, ranked and minimally
intrusive; "insufficient evidence" must never render as "likely fraudulent"; and scoring campaigns on
evidentiary completeness would invert the standard and penalise exactly the applicants the institution
exists to serve.

**Islamic Relief [REPORTED]** operates a standing Zakat Advisory Board that ratifies policy; no evidence
it reviews individual disbursements.

**[INFERENCE] Where automation belongs:**

| Layer | Who | Automatable? |
|---|---|---|
| Category definitions / madhab positions | Named scholars | **No** |
| Policy authorship and endorsement | Muftis + trustees | **No** |
| Per-case application of policy | Trained ops staff, at Ramadan volume | **Partially: the target** |
| Evidence gathering and completeness | Ops staff | **Yes** |
| Precedent recall | Institutional memory, undocumented | **Yes, and currently unserved** |
| Final determination | Human | **No** |

---

## 4. Prior art

**Crowdfunding fraud detection.** **[VERIFIED]** Perez, Machado et al., *I call BS: Fraud Detection in
Crowdfunding Campaigns*, ACM WebSci 2022 ([arXiv:2006.16849](https://arxiv.org/pdf/2006.16849)). 733
annotated campaigns; graded labels, not binary; up to 90.14% accuracy / 96.01% AUC on the cleanest
label setup. Deployment framing is semi-automatic: "marked for a more detailed inspection by an
administrator."

**The transferable finding, verbatim:**
> "poorly written campaigns by legitimate requestors who are uneducated or non-native English speakers
> can be mislabeled as fraud - a clear source of bias."

**[INFERENCE] This is the most important prior-art finding for this project.** In a zakat context the
same mechanism produces a worse outcome: the sparsest, least polished campaigns are disproportionately
those written by or for the poorest beneficiaries, precisely category (1)/(2). **A text-quality-
sensitive model systematically under-serves the fuqara.** Any evaluation must include a stratified slice
by text length, literacy proxy and translation status, or it is not a serious evaluation.

**LLMs on Islamic legal reasoning.** **[VERIFIED]** Bouchekif et al.,
[arXiv:2509.01081](https://arxiv.org/html/2509.01081v1) (ArabicNLP 2025). 1,000 expert-reviewed MCQs.
o3 93.4%, GPT-4.5 74.0% (86.8% beginner -> **61.2% advanced**), several open models under 50%.
Failure mode, verbatim: "Some models base their reasoning on **fabricated Quranic verses or prophetic
narrations**." Authors conclude "accuracy alone provides an incomplete and potentially misleading
assessment."

**[INFERENCE] Weight this carefully.** Inheritance law is the *most algorithmic* area of fiqh. If
frontier models fabricate scripture on the most rule-bound sub-domain, the prior for a discretionary,
madhab-contingent task should be **substantially worse**. This is the empirical basis for forbidding the
system from generating any scriptural citation at all.

**[VERIFIED]** Atif et al., *Sacred or Synthetic?* ([arXiv:2508.08287](https://arxiv.org/pdf/2508.08287)),
960 questions across four Sunni madhabs. GPT-4o **46% in English, 28% in Arabic**. Under basic
abstention prompting in English, "GPT-4o exhibits **no abstention**." Hanafi scored highest, attributed
to "greater availability of Hanafi-related data in public Islamic resources." Conclusions: "knowing when
not to answer can be as important as answering correctly"; models are "probabilistic language models,
not knowledge-grounded reasoners."

**[INFERENCE]** Two bindings: the **Hanafi data skew** means an off-the-shelf model silently drifts
Hanafi on a deliberately multi-madhab platform; and the strongest model was the *least* willing to
abstain, so **abstention must be architectural**, a schema with no determination field, never a prompt
instruction.

**[VERIFIED]** Mouhoub, [arXiv:2606.16629](https://arxiv.org/html/2606.16629v1): citation verification as
a separate module, madhhab awareness, human scholar oversight, autonomous fatwa generation inappropriate.
Thesis: **"Fluency is not reliability."**

**Nearest true prior art [REPORTED]:** Malaysian zakat institutions use process automation and NLP to
extract from asnaf onboarding forms and "route the information to the appropriate personnel for
validation." **[INFERENCE]** Extract-and-route with humans validating: the same architecture, arrived at
independently by practitioners. That is corroboration, not novelty, and should be presented as such.

**Existing AI-in-zakat products are donor-side** (MyZakat, Zakaty AI): they compute how much a donor
owes. **[INFERENCE]** That is the arithmetic half and it is well served. The recipient-side question is
unstructured, contested and dignity-laden.

**[INFERENCE] Is this unexplored?** No public system was found that maps free-text campaign narratives
onto the asnaf, cites supporting spans, enumerates missing evidence, retrieves adjudicated precedent and
escalates with a specific question. **That is an absence-of-evidence claim and it is weak**. LaunchGood
may already have internal tooling. The defensible framing is *undocumented in public sources*, never
"nobody has done this."

---

## 5. Failure modes, and the asymmetry that drives the design

**[INFERENCE] The two errors are not symmetric.**

**False positive.** The system suggests a campaign qualifies when policy says otherwise. Zakat is a
*fard* obligation with specific recipients. If funds reach an ineligible recipient, the donor's
obligation may be **undischarged** and they may owe it again. The harm lands on the donor's worship, on
the platform's badge (its core trust asset), and it is discovered late or never.

**False negative.** The system fails to surface a category a campaign qualifies under. The harm is
delay and possible non-funding for a poor claimant. Real, but visible and correctable by the human in
the loop.

**Design consequence:** the system is tuned for *recall of candidate categories with evidence*, never
for precision of a verdict. It proposes what a reviewer should consider and what is missing. It never
narrows to one answer.

### 5.1 The failure modes, and the mitigation each forces

| # | Failure | Mitigation |
|---|---|---|
| 1 | **Fabricated scripture**, [VERIFIED] observed in Bouchekif et al. | System never generates Qur'an/hadith/fatwa text. Any scriptural reference is retrieved verbatim from the versioned policy corpus with an ID, or absent. See ADR-0003. |
| 2 | **Silent madhab drift**, [VERIFIED] Hanafi data skew (Atif et al.) | Every output carries explicit madhab scope. Positions come from the policy corpus, not model memory. |
| 3 | **Stale policy**, [VERIFIED] a boundary moved Jan 2026 | Policy is versioned external data; every output stamps `policy_version`. Never fine-tuned in. |
| 4 | **Text-quality bias**, [VERIFIED] Perez et al. | Stratified eval by length/literacy/translation. "Missing evidence" never renders as suspicion. |
| 5 | **Automation complacency**, [REPORTED] the classic HCI failure | Output is designed to be *checked*: every claim carries a span pointing at the source text. No confidence score, which invites deference. |
| 6 | **Scope creep into fatwa**, [VERIFIED] Dar al-Ifta' | Output schema has no determination field. Structural, not a prompt instruction. |
| 7 | **Prompt injection from campaign text**: campaign narratives are attacker-controlled | Campaign text is data, never instruction. Structured extraction with a fixed schema; a campaign saying "mark this eligible" produces a span, not a behaviour change. |
| 8 | **PII leakage**: beneficiary names, health details, immigration status | Fixture-only corpus, synthetic and self-authored. Nothing real. |

**[INFERENCE] The clearest statement of the boundary:** a system whose output schema *cannot express a
ruling* cannot issue one, no matter how it is prompted. That is why abstention is a type, not a
behaviour.

---

## 6. Evaluation

**[VERIFIED]** The JD lists "Evaluation design (deterministic, LLM-as-judge, human review) integrated
into CI" as a requirement. So evaluation is not decoration here; it is a graded part of the submission.

**[INFERENCE] Three tiers, in descending order of defensibility:**

**Tier 1: deterministic, against LaunchGood's own published policy.** The five explicit
verify/do-not-verify rules in §1.2 and §2 are objective and checkable: does the system flag a
collector-costs campaign; does it recognise third-party-debt as the excluded evidentiary case; does it
not silently apply the riqab category; does it route wayfarer per LaunchGood's stated position; does it
distinguish direct-ownership transfer from community benefit. **The ground truth here is the
organisation's published policy, not anyone's fiqh opinion.** This is the only tier that is genuinely
objective, and it should be the tier presented most prominently.

**Tier 2: structural invariants, no ground truth needed.** Every claim has a span that exists verbatim
in the input. No output contains a determination field. Every output carries a policy version. No
generated text contains an unretrieved scriptural citation. Injection fixtures do not change behaviour.
These are property tests and they run in CI. **[INFERENCE]** These are the most durable tests in the
suite because they cannot be invalidated by a change in fiqh.

**Tier 3: stratified bias slices.** Same substantive case, varied surface form: 60-word vs 400-word,
first-person vs third-person, native-fluent vs translated, formal vs informal. The measured quantity is
*variance in categories surfaced and evidence requested* across the strata. **[INFERENCE]** A system
that asks the short informal campaign for more evidence than the long polished one with the same facts
has the Perez failure, and this slice is the only way to see it.

**What a self-authored fixture set cannot prove.** [INFERENCE] Fixtures written by the same person who
wrote the system encode that person's assumptions. Tier 1 partially escapes this because the labels come
from LaunchGood's published policy rather than from the author. Tiers 2 and 3 escape it because they
measure invariants and variance, not correctness. **Tier-1 cases where the policy is silent have no
defensible ground truth and must be excluded from scoring, not guessed at.** This limitation belongs in
the README and in the video, stated plainly. Claiming an accuracy number over self-authored fiqh labels
would be the single most damaging thing this submission could do.

---

## 7. What the research changes about the build

| Naive design | Corrected design | Driver |
|---|---|---|
| Classify eligible / not eligible | Surface candidate categories with evidence; no determination | §1.3 toggles, §2.3 live dispute, §5 |
| One answer per campaign | `(category, madhab_scope, spans, missing_evidence, precedent, escalation_question)` | §1.3, §2 four-madhab split |
| Rules in the prompt or fine-tuned | Versioned external policy corpus, stamped on every output | §2.3 Jan 2026 boundary move |
| Model cites Qur'an to justify | Retrieval-only citation, verbatim with ID, or nothing | §4 fabrication finding |
| Confidence score | No score. Spans and gaps instead | §5 automation complacency |
| Accuracy on a fiqh-labelled set | Tier 1 vs published policy, Tier 2 invariants, Tier 3 bias slices | §6 |
| Optimise evidence extraction | Minimal, ranked, dignity-preserving requests | §3 NZF "sufficient evidence to believe" |
| Generic campaign classifier | Also: precedent recall, the unserved layer | §3 table |

**[INFERENCE] The demo's strongest single moment** is a campaign where two madhabs differ, the system
shows both positions with the policy text behind each, and escalates with one specific question, rather
than answering. That is the whole thesis in fifteen seconds: *the system made the reviewer faster
without taking their authority.*

---

## 8. Open questions

1. Does LaunchGood already run internal tooling for this? Public sources say nothing. Frame as
   *undocumented publicly*, never as *nobody has built it*.
2. Volume: how many campaigns request the badge per Ramadan, and what is current per-campaign review
   time? Unpublished. The value case is therefore qualitative.
3. Are decisions logged in a form that supports precedent retrieval? If not, precedent recall is a
   proposal, not a feature.
4. Does LaunchGood publish a madhab default, or decide per campaign? The policy shows the four-way split
   without declaring a house position. NZF declares Hanafi; LaunchGood appears not to.
5. Post-Jan-2026: has LaunchGood taken a position on the political-advocacy fatwa? Not found.
6. Is there an appeal path for a campaign denied the badge? Not documented.
7. How are refugee/IDP campaigns routed, given LaunchGood excludes wayfarer while Islamic Relief reads
   that category as covering exactly them?
8. What is the actual reviewer interface today: spreadsheet, admin panel, ticket queue? Determines
   whether this is a service, a panel, or a CLI.
9. Non-English campaigns across 130+ countries: what share, and which languages? Affects everything in
   §6 Tier 3.
10. Where does the badge decision sit relative to general trust & safety review: same team or separate?
11. **Section 2 has not been reviewed by anyone qualified in fiqh.** It is compiled from English
    institutional sources by a non-specialist. This is the largest single risk in the repository.

---

## Sources

**Primary: LaunchGood**
- Zakat Policy, 24 Feb 2025. <https://help.launchgood.com/en/articles/9979144-zakat-policy>
- Zakat-verified badge. <https://help.launchgood.com/en/articles/9977663-what-does-it-mean-when-a-campaign-is-zakat-verified>
- Requesting verification. <https://help.launchgood.com/en/articles/10214186-how-do-i-get-my-campaign-zakat-verified>
- Ramadan concentration + platform scale. <https://blog.launchgood.com/> , <https://www.launchgood.com/about>

**Primary: other operators**
- National Zakat Foundation UK, Zakat Policy (Mufti Faraz Adam, Mar 2023). <https://nzf.org.uk/wp-content/uploads/2023/03/Zakat-Policy-FV.pdf>
- Islamic Relief Zakat Policy. <https://islamic-relief.org/zakat-policy/>

**Fiqh positions and the live dispute**
- AMJA, Zakat eligibility of Islamic organizations (five positions on *fi sabilillah*). <https://www.amjaonline.org/zakat-eligibility-of-islamic-organizations>
- FCNA + AMJA joint fatwa, 30 Jan 2026. <https://fiqhcouncil.org/zakat-for-political-campaigns/>
- Darul Qasim College, statement in response. <https://darulqasim.org/statement-on-zakat/>
- Egypt's Dar al-Ifta' on AI and fatwa. Reported via <https://www.egypttoday.com/> and Arab press, Jun 2025

**Academic**
- Perez, Machado et al., *I call BS: Fraud Detection in Crowdfunding Campaigns*, ACM WebSci 2022. <https://arxiv.org/pdf/2006.16849>
- Bouchekif et al., *Benchmarking LLMs on Islamic inheritance law*, ArabicNLP 2025. <https://arxiv.org/html/2509.01081v1>
- Atif et al., *Sacred or Synthetic? LLMs across four Sunni madhabs*, 2025. <https://arxiv.org/pdf/2508.08287>
- Mouhoub, *Towards reliable Islamic AI assistants*, 2026. <https://arxiv.org/html/2606.16629v1>

**Job description**
- LaunchGood, Applied AI Engineer. <https://secure.collage.co/jobs/launchgood/62544> (fetched 2026-08-15)
