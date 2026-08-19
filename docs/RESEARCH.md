# Domain Research: Zakat Eligibility on a Crowdfunding Platform

Research date: 2026-08-19. This document grounds the design decisions in `docs/adr/`. It is a
research brief, not a fiqh reference, and it takes no position on any contested question.

## How to read the evidence markers

Every factual claim below is marked one of two ways.

- **VERIFIED**: the cited URL was fetched during this research and its content supports the claim.
  Quoted text is verbatim from the fetched page.
- **INFERENCE**: reasoned from verified material or from the structure of the problem. Not sourced,
  and labelled so a reader can discount it.

Where a source could not be fetched, or where a page did not support what a search snippet implied,
that is stated rather than smoothed over. Unresolved items are collected in **OPEN QUESTIONS**.

A note on scope and standing. Several sections below describe positions held by named scholars and
bodies who disagree with each other. Reproducing a disagreement accurately is not adjudicating it.
Nothing here should be read as this document, or the system it grounds, preferring one position.

---

## 1. LaunchGood's current zakat designation

### 1.1 The mechanism

LaunchGood operates a per campaign zakat verification with a donor facing badge.

- The creator self declares: in the Enhance section they select "Yes, this campaign is Zakat
  eligible" and pick a category from a dropdown, after which "Your campaign will then be verified by
  our team of compliance Zakat experts according to LaunchGood's Zakat Policy." **VERIFIED**
  (https://support.launchgood.com/support/solutions/articles/35000178116-how-does-my-campaign-get-verified-for-zakat-eligibility-)
- Review is claimed for every campaign, not sampled: "Every Zakat campaign at LaunchGood is verified
  by our team of compliance and Zakat experts in accordance with our Zakat Policy." **VERIFIED**
  (https://support.launchgood.com/support/solutions/articles/35000177606-does-launchgood-verify-zakat-campaigns-)
- The donor facing signal is a "Z" badge on the campaign thumbnail and under the Donate button, not
  self applicable by creators. **VERIFIED** (https://www.launchgood.com/zakatpolicy)
- A campaign that fails zakat verification is not removed: it "will still be able to raise money for
  non-Zakat funds on LaunchGood" if compliance approved it and it is marked Live. **VERIFIED**
  (https://support.launchgood.com/support/solutions/articles/35000178118-what-happens-if-my-campaign-is-not-considered-zakat-eligible-)

### 1.2 The published policy

The Zakat Policy page carries "Updated 24th February 2025" and enumerates the eight categories of
Qur'an 9:60. **VERIFIED** (https://www.launchgood.com/zakatpolicy)

Scholarly structure, quoted verbatim from the policy:

- "The position of the Madhabs on Zakat eligibility have been researched and compiled by Shaykh Omar
  Baig", reviewed by Mufti Wahajuddin (Hanafi), Shaykh Ma'an Dabbaagh (Maliki), Shaykh Ibrahim Khidr
  (Shafi'i), and Shaykh Abdullah Ashraf (Hanbali). **VERIFIED**
- The load bearing caveat, also verbatim: those scholars "reviewed the definitions of each category
  based on their respective madhab. However, they do not participate in the actual verification
  process." Verification is done by LaunchGood's zakat team. **VERIFIED**

Category level rules, verbatim from the policy:

- Poor and needy: "funds must go directly to the individual, either as cash or goods". Eligible
  examples include "Providing cash assistance to a struggling family". Ineligible examples include
  "Building a well that benefits a poor community but does not transfer direct ownership" and
  "Funding general community projects that do not provide direct, exclusive benefits". **VERIFIED**
- Fi sabilillah: LaunchGood verifies "under the contemporary definition" campaigns that "Alleviate
  poverty or improve health for needy Muslims" or "Promote Islamic interests in areas where Muslims
  are a minority and are in dire need." Eligible examples: "Building a water filtration system for a
  poor Muslim community" and "Supporting da'wah efforts in a non-Muslim country". Ineligible:
  "Funding military campaigns". **VERIFIED**
- Those in debt: two types are described, personal debt reducing net assets below nisab (verified
  under the poor and needy heading) and third party debt taken to prevent harm or conflict, of which
  "LaunchGood does not verify these cases due to difficulty confirming the situation." **VERIFIED**
- Not verified at all: zakat collectors as a sole purpose; travelers ("due to technological
  advancements, it is unlikely that a person stranded would have the ability to create a
  campaign..."); those in captivity ("this category no longer applies today"). **VERIFIED**

Donor configurable settings. The policy exposes five toggles, each labelled with the scholarly
constituency that accepts it: Poor and Needy ("Valid recipients according to all classical and
contemporary scholars"), Community Welfare ("many contemporary interpretations"), New Muslims
("Shafi'is, Hanbalis, and many contemporary interpretations"), Religious Support ("many contemporary
interpretations"), Non-Muslims ("Malikis, Hanbalis and many contemporary interpretations").
**VERIFIED**

Disclaimers, verbatim: "LaunchGood does not review the internal procedures, accounting, handling, or
distribution of Zakat funds" and "it is the donor's responsibility to ensure their obligation of
Zakat is fulfilled." **VERIFIED**

### 1.3 Two observations about the published policy

**INFERENCE.** The policy resolves infrastructure by category routing rather than by a blanket rule.
A well is named as an ineligible example under poor and needy because ownership does not transfer,
while a water filtration system for a poor Muslim community is named as an eligible example under fi
sabilillah. The same physical project therefore lands differently depending on which category is
claimed. For a triage system this means the category a creator selects is itself a claim to be
tested against the text, not a routing key to be trusted.

**INFERENCE.** The donor toggles are the platform's existing acknowledgement that "zakat eligible"
is not one predicate. Any triage output that collapses to a single boolean is less expressive than
the product LaunchGood already ships.

### 1.4 Independent critique

Darul Iftaa Canada published a review of the policy on 2026-03-18, authored by Mufti Mohammed
Wahaajuddin and approved by Mufti Faisal bin Abdul Hamid al-Mahmudi. It objects to zakat approval
for communal projects on the ground that "100% of the donation must be given to a zakāt-eligible
recipient", to the accountability gap created by LaunchGood not reviewing downstream handling of
funds, and to the inclusion of mu'allafah qulubuhum, combating Islamophobia under fi sabilillah, and
organisation employee salaries. It concludes that donors must do their own due diligence.
**VERIFIED** (https://fatwa.ca/review-of-launchgoods-zakat-policy/)

Caveat worth stating plainly: the review predates the 2025-02-24 policy version fetched here. The
current policy text returned no match for "Islamophobia", "school", or "education" when searched.
**VERIFIED** (negative finding on https://www.launchgood.com/zakatpolicy)

### 1.5 Volume and the Ramadan concentration

- LaunchGood's Ramadan giving report (published 2022-03-29, covering Ramadan 1443) states "1.05
  million donations made on the platform during Ramadan that raised over $47 million" and "78% of
  Zakat donations came inside of Ramadan". Traffic went from "591,642 sessions per month outside of
  Ramadan" to "4,026,353 for just the 30 days", which the report puts at "62% of all sessions in
  that year." **VERIFIED**
  (https://blog.launchgood.com/posts/launchgood-ramadan-giving-report-insights-trends)
- A platform milestone page claims "$296.3 million" raised, "1 million" donors and "5.3 million"
  donations, and describes LaunchGood as "the world's largest crowdfunding platform for Muslims."
  **VERIFIED** (https://www.launchgood.com/1million). Wikipedia reports a later, unreconciled figure,
  "raised more than $688 million from 2.1 million donors across 155 countries", and a 2013-10-08
  founding in Detroit. **VERIFIED** as to what that article says
  (https://en.wikipedia.org/wiki/LaunchGood); tertiary source.

**INFERENCE.** The operational consequence of the 78% figure is that zakat review demand is not
merely seasonal, it is a spike of roughly 3.5x baseline traffic compressed into 30 days, arriving at
the one point in the year when reviewer attention is scarcest. A triage system's value is
concentrated almost entirely in that window, and so is its risk.

---

## 2. The eight categories of Qur'an 9:60

Verse text, verbatim, Dr. Mustafa Khattab, The Clear Quran, as displayed:

> "Alms-tax is only for the poor and the needy, for those employed to administer it, for those whose
> hearts are attracted ˹to the faith˺, for ˹freeing˺ slaves, for those in debt, for Allah's cause,
> and for ˹needy˺ travellers. ˹This is˺ an obligation from Allah. And Allah is All-Knowing,
> All-Wise."

**VERIFIED** (https://quran.com/9/60)

The word "only" (innama) is why the list is treated as exhaustive rather than illustrative. Zakat
Foundation of America states the point directly: "The eight exclusive categories of 'people' that God
has designated in the Quran as eligible for Zakat payments exclude all other persons." **VERIFIED**
(https://www.zakat.org/what-makes-a-nonprofit-organization-zakat-eligible)

For each category below: the standard transliteration, a gloss, and the campaign-text evidence that
would bear on it. Every *Campaign evidence* line is **INFERENCE**: a design proposal derived from the
sourced definitions above it, not itself a sourced claim. Glosses are deliberately brief; each
category has a literature far larger than this summary, and the contested ones are treated in
section 3 rather than settled here.

### al-fuqara (the poor)

Those whose wealth falls below the threshold at which zakat becomes payable. National Zakat
Foundation UK, working explicitly on Hanafi criteria, operationalises this as "the Zakat applicant's
net Zakatable assets and unused personal assets of a year are below the Nisab." **VERIFIED** (NZF
Zakat Policy, March 2023, https://nzf.org.uk/wp-content/uploads/2023/03/Zakat-Policy-FV.pdf). Nisab
is stated by NZF Canada as 20 dinars / 85g gold or 200 dirhams / 595g silver **VERIFIED**
(https://www.nzfcanada.com/zakat-faq/what-is-nisab). Sources differ on whether fuqara or masakin
denotes the more destitute state, and the schools split on it.

*Campaign evidence*: a named individual or household beneficiary; a stated financial position
(income, assets, debts); an assertion of inability to meet basic needs; whether funds reach a person
or an institution.

### al-masakin (the needy)

The adjacent category of material need. NZF UK's public page glosses it as "The people whose earnings
do not cover their basic needs" **VERIFIED** (https://nzf.org.uk/knowledge/who-receives-zakat/), a
framing it attributes to the majority; Hanafi sources define masakin as those with no earnings at
all. Islamic Relief reads the pairing of the two words as an instruction to serve both "the poor and
the ultra-poor", prioritising the latter where feasible. **VERIFIED**
(https://islamic-relief.org/zakat-policy/)

*Campaign evidence*: subsistence-level detail rather than aggregate need language; specific unmet
basic needs (food, shelter, medicine); household size; absence of income.

### al-amilina alayha (those employed to administer it)

Those appointed to collect and distribute zakat, compensated for that labour. Muslim Hands notes the
category's ordering: it comes "third only after the poor (Al-Fuqara) and needy (Al-Masakin)."
**VERIFIED** (https://muslimhands.org.uk/islamic-resources/a-100-zakat-policy-the-facts). This is the
doctrinal route by which organisations charge administrative cost to zakat, and it is contested in
amount (section 3.3).

*Campaign evidence*: whether the campaign is raising for its own delivery costs; any stated
administrative deduction or platform fee; whether the raising entity is the distributing entity.

### al-mu'allafati qulubuhum (those whose hearts are to be reconciled)

Those given zakat to incline or reassure them toward Islam or the Muslim community. LaunchGood's own
policy summarises the split: "Hanafis limit this to the Prophet's lifetime, while Malikis, Shafi'is,
and Hanbalis extend it to non-Muslims and new Muslims." **VERIFIED**
(https://www.launchgood.com/zakatpolicy). This is the category most contested as to whether it still
operates at all (section 3.6).

*Campaign evidence*: new Muslim support, convert care, community relations work; explicit statements
about the faith or affiliation of beneficiaries.

### fi al-riqab (freeing those in bondage)

Historically the manumission of slaves and ransom of captives. No source found here argues the
category has lapsed; institutions instead reinterpret it. Islamic Relief: "Where IR finds people
suffering from a modern form of slavery, such as bonded labour, forced labour, or human trafficking,
Zakat funds may be utilised to emancipate people from such forms of slavery." **VERIFIED**
(https://islamic-relief.org/zakat-policy/). AMJA extends it to legal defence: it is "reasonable to
pay the organizations who defend the legal rights of Muslims under the category of riqâb, based on
the view that extends the meaning of this term to include freeing the captives and paying bail for
the unjustly imprisoned." **VERIFIED** (https://www.amjaonline.org/zakat-eligibility-of-islamic-organizations).
By contrast LaunchGood's policy states the category "no longer applies today." **VERIFIED**

*Campaign evidence*: trafficking or bonded labour; bail, ransom, or unjust detention; whether the
funds free a specific person or fund an advocacy programme.

### al-gharimin (those in debt)

Those unable to discharge a debt from their own means. NZF defines them as "Those whose liabilities
exceed their Zakatable and surplus assets." **VERIFIED**
(https://nzf.org.uk/knowledge/who-receives-zakat/). Conditions are discussed in section 3.4.

*Campaign evidence*: a specific creditor and amount; the purpose the debt was incurred for; whether
the debt is currently due; whether the debtor has assets; whether the debt was incurred to reconcile
a dispute between others.

### fi sabilillah (in the path of God)

The category whose scope is most disputed and most consequential for campaigns. Read narrowly it
covers armed struggle and, on some accounts, those unable to complete Hajj; read broadly it covers
da'wah, education, health, and public benefit works. Both readings are sourced to named holders in
section 3.1, which is where this category is actually treated.

*Campaign evidence*: whether the campaign claims a general public-benefit purpose; whether
beneficiaries are individuals or an institution; whether an asset is built and who ends up owning
it; whether the context is a Muslim minority setting; any military or armed element.

### ibn al-sabil (the wayfarer)

A traveller cut off from their means, entitled to zakat to reach home even if wealthy where they came
from. UNHCR's zakat materials describe the modern extension: "most internally displaced persons
(IDPs) actually enter into the category of ibn sabeel", and note that "Modern Hanafi scholars have
actively sought to extend the category of Ibn Al-Sabil" to those separated from their wealth by
persecution or upheaval. **VERIFIED** (https://zakat.unhcr.org/blog/en/beneficiaries/abna-sabeel).
Islamic Relief defines travellers as 48+ miles from home, including refugees. **VERIFIED**
(https://islamic-relief.org/zakat-policy/)

*Campaign evidence*: displacement, refugee or asylum status, stranded travel; distance from home;
whether the beneficiary retains inaccessible assets elsewhere.

### Cross-cutting recipient restrictions

Beyond the eight categories, Islamic Relief states two exclusions that apply regardless: "The
recipient must not belong to your immediate family; your spouse, children, parents and grandparents
cannot receive your zakat" and "The recipient must not be a Hashimi, a descendant of the Prophet
(PBUH)." **VERIFIED** (https://islamic-relief.org/recipients-of-zakat/). NZF UK's policy adds "The
Zakat applicant must be a Muslim." **VERIFIED** (NZF Zakat Policy PDF)

---

## 3. Where recognised scholars genuinely differ

Each subsection presents opposed positions with named holders. The document takes no side. These are
exactly the territories where a triage system must decline to conclude.

### 3.1 Scope of fi sabilillah

**Narrow.** A Hanafi fatwa by Shaykh Sohail Hanif holds that zakat requires "The transfer of
ownership (tamlik) of a part of one's wealth that the Lawgiver has specified to be given to a poor
muslim", that "it is invalid to give it for other acts of good, such as da`wah, building mosques or
charity", and that Hanafi texts read the path of Allah as "those fighting in the way of Allah as well
as those wanting to offer the Hajj", the recipient still needing to be legally poor. It characterises
the broad modern reading as "aberrant (shadhdh)" and traces it to Abduh, Rida, Mawdudi and Qaradawi.
**VERIFIED** (https://islamqa.org/hanafi/qibla-hanafi/36517/zakat-fitr-cannot-be-given-for-projects-dawah-the-meaning-of-in-the-way/)

**Broad.** AMJA adopts the widest of the positions it surveys: fi sabilillah "includes all forms of
jihad, including intellectual jihad through da'wah, dispelling misconceptions, and defending the
religion and its people through all legitimate means", and it defends overhead by analogy: "If one
says that zakat money may be used to support orphans, but it cannot be used to build orphanages, this
argument may be invoked against them." It nonetheless restrains itself on mosques: "Our mosques
should be built using the purest of our wealth, not zakat money. The only exception is in indigenous
communities or small towns where a mosque cannot otherwise be built." **VERIFIED** (Dr. Hatem al-Haj,
2021-11-08, https://www.amjaonline.org/zakat-eligibility-of-islamic-organizations)

A separate AMJA fatwa by Dr. Main Khalid Al-Qudah (2009-08-27) reaches the opposite conclusion on
mosques, citing a Muslim World League Fiqh Council ruling (1405 AH) that fi sabilillah "could include
any Islamic work, especially when there is a desperate need for it", and concluding that "building
and maintaining Masajid is a legitimate Zakah recipient" in Western contexts. **VERIFIED**
(https://www.amjaonline.org/fatwa/en/79782/zakah-money-for-the-construction-of-the-masjid). Two
fatwas from the same body reaching different conclusions on the same question, twelve years apart, is
itself worth noting.

**Middle.** Dr. Muzammil H. Siddiqi (former ISNA president, chairman of the Fiqh Council of North
America): "Zakah is basically for the poor and needy and most of it should be used to take care of
their needs. I believe that for the mosque constructions, Muslims should make extra charity...
However, it is not forbidden for Muslims to give their Zakah money for the building of mosques and
schools, especially in non-Muslim countries." The same answer names Abduh, Rashid Rida, Mawdudi and
Amin Ahsan Islahi, plus "some Fatwa organizations in Kuwait and Egypt", as holders of the broad view.
**VERIFIED** (https://aboutislam.net/counseling/ask-the-scholar/zakah-and-charity/can-zakah-given-construct-mosques-islamic-centers/)

### 3.2 Tamlik (transfer of ownership)

Tamlik is the doctrinal engine under 3.1. The Hanafi fatwa above states it plainly: "The key term
'tamlik' (transfer of ownership) is the reason why Zakat cannot be given to build a mosque", and the
recipient must be "both needy and a person." **VERIFIED** (islamqa.org Hanafi, as above)

Two operational responses are documented.

- **Wakalah (agency).** NZF UK's policy: "NZF enters into an agency agreement with the applicant
  wakalah, whereby the ownership of Zakat funds is transferred to the Zakat recipient. Applicants
  authorise NZF to receive Zakat funds on their behalf". The policy attributes the model to "The
  al-Qalam Shariah Panel as well as other scholars" and notes it "is also used in Darul Ulooms and
  Islamic seminaries in India, Pakistan and Bangladesh." **VERIFIED** (NZF Zakat Policy PDF)
- **Community ownership of the asset.** Islamic Relief funds "communal welfare assets and programmes,
  such as clean water sources, health clinics, critical medical equipment", and states that "Once
  completed, ownership and management of the asset is transferred to the local community". **VERIFIED**
  (https://islamic-relief.org/zakat-policy/)

AMJA's public reasoning route does not engage tamlik as a separate hurdle; it argues through fi
sabilillah scope instead. **VERIFIED** as an absence
(https://www.amjaonline.org/zakat-eligibility-of-islamic-organizations)

**INFERENCE.** For a water well campaign, therefore, the determinative question is not "is a well
zakat eligible" but "which category is claimed, and is there a mechanism (wakalah, or transfer of
ownership to the beneficiary community) that satisfies tamlik under the reviewer's school." That is a
question about the campaign's operating structure, which campaign copy usually does not state.

### 3.3 Organisational overhead

There is no single number, and the spread is wide among bodies that all consider themselves within
the rules.

| Body | Position | Source |
|---|---|---|
| International Islamic Fiqh Academy (OIC), July 2020, conditions on UNHCR's Refugee Zakat Fund | "UNHCR's 100% Zakat distribution policy implying zero deduction of overhead costs from Zakat funds", plus "a dedicated bank account is in place to receive Zakat funds only" | **VERIFIED** https://zakat.unhcr.org/africa/fatawa/international-islamic-fiqh-academy-ksa |
| National Zakat Foundation UK | "100% of Zakat is used for charitable activity. We do not use Zakat to raise funds. We do not use Zakat to cover core costs." Distribution-service contribution is capped: "we limit the contribution to no more than 10%" and the giver chooses whether it comes from zakat or sadaqah | **VERIFIED** NZF Zakat Policy PDF |
| Islamic Relief Worldwide | "eligible to take a reasonable portion of 12.5% of zakat funds to cover the costs of delivery of zakat eligible projects", excluding fundraising, marketing, sponsorship, influencers, generic training and governance | **VERIFIED** https://islamic-relief.org/zakat-policy/ |
| Islamic Relief USA | "80% is used to implement programs serving our rights holders. 20% is used to cover administrative fees for IRUSA and our implementing partner(s)" | **VERIFIED** https://irusa.org/zakat-policy/ |
| Penny Appeal | Own fee zero, but "these partners may incur necessary costs... Islamically, they are entitled to use up to 12.5% of Zakat funds for these expenses" | **VERIFIED** https://pennyappeal.org/appeal/100-zakat |
| Muslim Hands UK | Argues 100% claims are structurally misleading ("In order to ensure a '100% Zakat' policy, funds have to be taken from somewhere else"), funds its own admin from Gift Aid | **VERIFIED** https://muslimhands.org.uk/islamic-resources/a-100-zakat-policy-the-facts |

Two affiliates of the same charity family publish caps of 12.5% and 20%, and a major fiqh academy
conditioned its own authorisation on 0%.

### 3.4 al-gharimin conditions

UNHCR's zakat portal summarises school positions: "the person that has the means to repay his debt is
not eligible to receive Zakat"; Maliki, Shafi'i and Hanafi require the debt to have been incurred
"for something lawful"; the Maliki school excludes deliberate debt taken to qualify, "Because we
don't want to encourage people to go into debt." Shafi'i and Hanbali recognise debt taken to
reconcile feuding parties as eligible even where the debtor is not personally poor. **VERIFIED**
(https://zakat.unhcr.org/blog/en/beneficiaries/the-debtors)

Egypt's Dar al-Ifta distinguishes lawful debt, unlawful debt followed by repentance, and unrepented
unlawful debt as differently eligible. **VERIFIED**
(https://www.dar-alifta.org/en/fatwa/details/6398/giving-zakat-to-a-person-in-debt)

**INFERENCE.** Compared to 3.1 to 3.3, this category is comparatively settled on principle and
contested mainly on fact: was the debt lawful, is the debtor genuinely unable to pay. Those are
evidentiary questions, not doctrinal ones, and campaign copy rarely answers them.

### 3.5 ibn al-sabil in modern application

Applying the category to refugees, IDPs and displaced people is mainstream rather than fringe. UNHCR
grounds it on the classical traveller definition plus modern Hanafi extension (quoted in section 2),
and Zakat Foundation of America places refugees primarily under al-gharimin and secondarily under ibn
al-sabil, citing a hadith about a man "whom calamity strikes, destroying his property." **VERIFIED**
(https://www.zakat.org/can-zakat-be-given-to-refugees)

LaunchGood, by contrast, declines to verify traveller campaigns at all, on practical rather than
doctrinal grounds. **VERIFIED** (section 1.2)

### 3.6 Must the recipient be Muslim, and is mu'allafati qulubuhum still operative

**Category lapsed.** A Hanafi fatwa from Darul Iftaa Birmingham: "Zakat cannot be paid to any
disbeliever at all. The 'muallafat-e-quloob' is abrogated now", attributing the position to Malik,
al-Thawri, Ishaq ibn Rahawayh and Abu Hanifah. **VERIFIED**
(https://islamqa.org/hanafi/daruliftaa-birmingham/135716/can-muslims-give-zakat-to-non-muslims/)

**Umar's precedent, read two ways.** Darul Qasim (a US Hanafi seminary) reports that "It is a
historical fact that none of the Rightly Guided Caliphs paid zakāt to this category after ʿUmar's
decision", and states "this is the position of the Ḥanafī madhhab". **VERIFIED**
(https://darulqasimcollege.org/allocating-zakat-money-for-political-campaigns/). SeekersGuidance
presents the counter-reading: "The fact that 'Umar, 'Uthman, and 'Ali did not give to them during
their caliphates is because there was no need to do so at that time, not because the category was
abrogated." **VERIFIED**
(https://seekersguidance.org/answers/zakat/is-zakat-for-those-whose-hearts-are-attracted-to-the-faith-still-applicable/)

**Category operative and extended.** The Fiqh Council of North America, in a fatwa dated 2026-01-30
(11 Sha'ban 1447), holds "there is no evidence to suggest this ruling is abrogated, as the default
for all verses are that they are to be applied in all times", and permits funding efforts benefiting
the Ummah "either in one's own country or locality (such as countering a clearly anti-Muslim
politician) or internationally". Signatories include Dr. Yasir Qadhi, Dr. Salah al-Sawi, Dr. Muzammil
Siddiqi, Dr. Hatem al-Haj and Dr. Zulfiqar Ali Shah. **VERIFIED**
(https://fiqhcouncil.org/zakat-for-political-campaigns/)

**General restriction.** On the underlying question, "it is not permissible to give Zakah to
non-Muslims except for Al-Mu'allafatu Qulubuhum". **VERIFIED**
(https://www.al-feqh.com/en/fatawa-zakah-and-sawm-categories-of-zakah-recipients-giving-zakah-to-a-kafir-1).
Islamic Relief's operating position is narrower than a blanket ban: "If other funds are not
available, then zakat may be used" for non-Muslims in Muslim-majority areas. **VERIFIED**
(https://islamic-relief.org/zakat-policy/)

This is a live, currently moving disagreement: a January 2026 fatwa from one major North American
body affirms a category that another contemporary body treats as abrogated.

### 3.7 Local versus distant distribution

The least contested of the seven. SeekersGuidance (Hanafi): "In general, the sunna is to give your
zakat to the needy of your community... Sending your zakat elsewhere would be disliked", but "it is
not disliked to send your zakat elsewhere if it is to a relative, to someone in greater need, to
someone more religiously scrupulous, to someone who is of greater benefit to the Muslims", the
guiding principle being "The best of charity is that which fulfils the greatest need". **VERIFIED**
(https://seekersguidance.org/answers/hanafi-fiqh/zakat-giving-locally-vs-abroad/)

Egypt's Dar al-Ifta permits cross-border transfer of zakat al-fitr and states the position "has been
the implemented opinion of Egypt's Dar al-Ifta since 1946 until present." **VERIFIED**
(https://www.dar-alifta.org/en/article/details/1894/transferring-zakat-money-from-one-country-to-another).
Note the fatwa concerns zakat al-fitr specifically and should not be generalised to zakat al-mal.

NZF Canada takes the locality position operationally: "Every dollar of Zakat collected is utilized in
Canada". **VERIFIED** (https://www.nzfcanada.com/zakat-policies)

---

## 4. How verification is actually done today

Two distinct regimes exist, and they are not interchangeable.

### 4.1 Individual-recipient means testing

**NZF UK.** Published requirements for the Hardship Relief and Housing funds: applicant must "Be
Muslim with legal UK status", over 18, UK resident, and "entitled to receive Zakat"; explicit
exclusions for asylum seekers, full time students, student visa and work permit holders, and those
with no status. Required documents: "Valid photo ID", "recent proof of address", and "three full
months of recent bank statements for all accounts", plus tenancy and rent or council tax
documentation for housing applicants. Shortlisting considers "Financial status, and Social
indicators". One successful application per person per year. **VERIFIED**
(https://nzf.org.uk/apply/hardship-relief-and-housing/)

The evidentiary standard, verbatim from NZF's policy, is worth quoting in full because it is the
closest published articulation of what "enough evidence" means in this domain:

> "The eligibility of a person is established based on the principle that Grants Officers observe
> sufficient evidence to believe that the applicant is eligible. This is the standard expected in the
> texts of Sacred Law to maintain the dignity of applicants."

Reviewed evidence is "Applicant, spouse and children IDs", "Net income", "Net assets" and
"Situation". Governance: "A Senior Grants Officer makes decisions on complex cases", "Applicants have
the right to request a review of the decision", "We audit a sample of applications every month", and
"An external Shariah advisor advises on our Zakat distribution policies and procedures". **VERIFIED**
(NZF Zakat Policy, March 2023, developed by Mufti Faraz Adam, endorsed by Mufti Amjad Mohammed)

**NZF UK's automation.** A vendor case study dated 2025-03-27 reports that "NZF receives about 10,000
applications for aid in an average month", that agents now use computer vision to read identity
documents and financial statements, and that a vulnerability score built from account balances,
family size and employment status ranks cases by urgency, cutting a four to five month wait by 80%
with a target of days. **VERIFIED**
(https://www.microsoft.com/en/customers/story/23068-national-zakat-foundation-microsoft-copilot-studio)

**INFERENCE, and important.** What NZF automated is triage and prioritisation against a threshold a
scholar-endorsed policy already fixed (below nisab, per Hanafi criteria). It did not automate the
determination of what the threshold is. That distinction is the whole design.

**NZF Canada.** "an assigned caseworker" makes the determination; "Most applications are processed
within 7 to 10 days from the submission of all supporting materials"; "All Shariah matters are
reviewed and approved by the Shariah Advisory Board (SAB) and the Islamic Compliance Committee".
**VERIFIED** (https://www.nzfcanada.com/apply, https://www.nzfcanada.com/zakat-policies)

**Lembaga Zakat Selangor (Malaysia, state authority).** Applications via portal, a local mosque
official (Penolong Amil Kariah), or a branch counter, with a physical step: "The process will be
carried out physically / on-site. Investigation through documentation". Approval runs against a named
internal standard (GPSKAZ) and a "Had Kifayah" subsistence threshold. **VERIFIED**
(https://www.zakatselangor.com.my/en/apply-for-zakat/)

### 4.2 Project and campaign level classification

**Islamic Relief Worldwide.** Named Zakat Advisory Board (Sheikh Abdullah al-Judai, Mufti Abdul Qadir
Barkatulla, Sheikh Mohammad Akram Nadwi) who "have ratified our Zakat policy and will provide
oversight and verification of the distribution of Zakat". The policy maps each of the eight
categories to programme types and explicitly declines to use mu'allafati qulubuhum. **VERIFIED**
(https://islamic-relief.org/zakat-policy/)

**Islamic Relief USA.** A differently composed named board (Dr. Muzammil H. Siddiqi, Dr. Zulfiqar Ali
Shah, Dr. Mohammed Moussa, Dr. Saad Eldegwy). Staff "must only distribute Zakat to projects or
beneficiaries which are eligible according to the categories outlined here" and "must provide a
justification as to how this project matches the criteria of Zakat". **VERIFIED**
(https://irusa.org/zakat-policy/)

**Zakat Foundation of America.** "Every avenue of Zakat Foundation's Zakat collection and
distribution is examined for eligibility and approved by qualified scholars of specialized
knowledge", with no individual scholars named on that page, and it pushes part of the burden to
donors: donors should "diligently question Zakat-collecting organization representatives regarding
their claims of Zakat-eligibility". **VERIFIED**
(https://www.zakat.org/what-makes-a-nonprofit-organization-zakat-eligible)

**Case-by-case scholarly authorisation.** AMJA reviewed UNHCR's Refugee Zakat Fund operations and in
March 2025 "issued a fatwa deeming it permissible for Muslims to donate Zakat to UNHCR", with
conditions. **VERIFIED** (https://zakat.unhcr.org/blog/en/fatwa/fatwa-amja)

### 4.3 Certification

**VERIFIED absence, qualified.** No standing third-party body was found that certifies a Western
charity or an individual campaign as zakat eligible. What exists instead is: state zakat authorities
with jurisdiction only over their own territory (Malaysia's state bodies, Indonesia's BAZNAS),
one-off fatwas from bodies such as AMJA and the IIFA authorising a named organisation, and
self-published policies ratified by an in-house or contracted scholar board. No zakat-specific UK
Charity Commission guidance document was located.

**INFERENCE.** There is therefore no external eligibility service to defer to. Every actor in this
space encodes its own policy, discloses it (to varying degrees), and stands behind it with named
scholars. A triage system inherits that structure rather than escaping it.

---

## 5. Prior art in automated charity vetting

### 5.1 Charity evaluators

- **Charity Navigator.** Four beacons ("Accountability & Finance, Impact & Measurement, Leadership &
  Planning, and Culture & Compensation") built on "self-reported data and publicly available IRS Form
  990s", metrics scored 0 to 1 and "combined using a weighted formula" into a 0 to 4 star rating. No
  human analyst review is described, and no claim is made about mission or doctrinal legitimacy.
  **VERIFIED** (https://intercom.help/charity-navigator/en/articles/8557824-charity-navigator-s-rating-system)
- **Candid / GuideStar.** Seals of Transparency awarded for self-disclosure; notably "You can earn a
  Gold Seal of Transparency without sharing an audited financial statement." A disclosure badge, not
  a vetting outcome. **VERIFIED**
  (https://candid.org/blogs/what-is-a-seal-of-transparency-your-questions-about-candid-seals-answered/)
- **GiveWell.** Analyst-driven and deliberately narrow: "We review dozens of programs each year",
  "Our researchers spend over 70,000 hours each year investigating programs", scope restricted to
  global health and poverty. **VERIFIED** (https://www.givewell.org/about/FAQ)
- **BBB Wise Giving Alliance.** Human-analyst driven against 20 published standards, beginning with
  "a request letter from an analyst to a charity asking that they complete our online questionnaire
  form". Its only religion-adjacent standard concerns clergy on governing boards, a governance
  question. **VERIFIED** (https://give.org/charity-landing-page/accreditation-process)

None of the four evaluates religious eligibility. The absence is verified only in the sense that no
fetched page raises the topic; no explicit disclaimer to that effect was found.

### 5.2 Crowdfunding trust and safety

- **GoFundMe.** "A robust human review from our world-class Trust & Safety experts", "Identity
  verification for any customer who receives funds", "Machine learning to catch higher risk
  donations", plus a refund guarantee. Verification guidelines cover organiser disclosures (who you
  are, who you are raising for, your relationship to the beneficiary, how funds will be spent).
  **VERIFIED** (https://www.gofundme.com/c/safety, https://www.gofundme.com/c/safety/verification-guidelines)
- **LaunchGood.** "Every account on LaunchGood is screened against over 400 sanctions lists which
  includes global sanctions, regulatory and, Anti Money Laundering enforcement lists", "Every
  campaign is manually reviewed by our team to make sure it follows our website guidelines", plus
  donation-level fraud review and blacklist-with-refund on discovery. The safety page does not
  mention zakat or religious eligibility anywhere. **VERIFIED** (https://www.launchgood.com/safety)

The trust-and-safety lane and the zakat lane are separate systems answering separate questions:
identity and fraud versus religious eligibility.

### 5.3 Academic work

- Perez, Machado, Andrews, Kourtellis, "I call BS: Fraud Detection in Crowdfunding Campaigns"
  (arXiv:2006.16849, 2020-06-30). Classifier over textual and image features from 700 annotated
  campaigns, reporting 90.14% accuracy and 96.01% AUC using only features available at publication
  time. **VERIFIED** (https://arxiv.org/abs/2006.16849)
- Doerstling et al., "A Disease Identification Algorithm for Medical Crowdfunding Campaigns:
  Validation Study", JMIR 2022;24(6):e32867. Named-entity recognition pipeline classifying the
  medical condition named in a GoFundMe description. Existence, authorship and scope **VERIFIED** via
  the Duke Scholars record (https://scholars.duke.edu/publication/1524709) and the authors' code
  repository (https://github.com/sdoerstling/medical_crowdfunding_methods); the JMIR page itself
  could not be fetched, so the abstract text is **UNVERIFIED**.
- Ho et al., "The Influence of Signals on Donation Crowdfunding Campaign Success during COVID-19
  Crisis", IJERPH 2021, doi:10.3390/ijerph18147715. Identifies campaign-based, fundraiser-based and
  social-interaction signals predicting funding success. **VERIFIED** via a Semantic Scholar PDF
  mirror; the publisher page returned 403.
- Hosni and Talbi, "Bridging the Trust Gap in Crowdfunding: A Novel Expert-Based Evaluation
  Mechanism" (arXiv:2509.23378, 2025-09-27). Weighted expert-panel scoring to reduce information
  asymmetry. **VERIFIED** (https://arxiv.org/abs/2509.23378). General crowdfunding, not charitable.

No academic work was found that attempts religious or zakat classification of campaign text.

### 5.4 The one real precedent for automated religious classification

Shariah stock screening is automated, at scale, and religiously authoritative, and its governance
structure is the reason it works.

From the FTSE Russell / IdealRatings Islamic Indices screening factsheet (April 2024), verbatim:

> "The FR IdealRatings Index series is based on the AAOIR (Accounting and Auditing Organisation for
> Islamic Financial Institutions) Shariah mandate and is approved by Shariah scholars Dr Mohamed El
> Gari, Dr M. Daud Bakar and Sheikh Yusuf Talal Delorenzo."

The rules the software applies are fixed, published and numeric: a business-activity exclusion list
(adult entertainment, alcohol, cinema and broadcasting, conventional insurance, conventional
financial services, defence, gambling, hotels, music, interest income, pork, tobacco) with the
combined non-compliant revenue threshold that it "does not exceed 5% of their total income"; and
three financial screens, interest-bearing debt over trailing 12-month average market capitalisation
"should not exceed 30%", cash plus deposits plus interest-bearing investments over the same
denominator "should not exceed 30%", and cash plus deposits plus receivables over total assets
"should not exceed 67%". Constituents are rescreened quarterly. **VERIFIED**
(https://www.lseg.com/content/dam/ftse-russell/en_us/documents/factsheets/idealratings-islamic-indices-shariah-screening-criteria-fact-sheet.pdf)

**INFERENCE.** The load-bearing property is authority separation. Named scholars rule once, on the
law, and publish thresholds. Software applies those thresholds mechanically to disclosed facts and
never interprets. Zakat eligibility of a narrative campaign is a harder problem than this, because
the inputs are free text rather than audited financials and because the rules themselves are
contested between the bodies that would set them (section 3). That argues for less machine authority
here, not more.

### 5.5 Fatwa production by machine

- Islam Q&A (2025-07-27, 2 Safar 1447) concludes on AI: "it is not permissible to ask it for fatwas
  or trust its answers in matters of religion", citing the classical qualifications of a mufti and
  AI's inability to verify sources or know an individual's circumstances. **VERIFIED**
  (https://islamqa.info/en/answers/540774)
- Egypt's Dar al-Ifta is reported to have ruled that "relying independently or entirely on
  AI-generated interpretations is not permissable" for Qur'anic interpretation, as it "risks
  subjecting the Quran to conjecture, inaccuracies and misrepresentation". **VERIFIED** as to what the
  reporting says (https://www.middleeastainews.com/p/egypts-dar-al-ifta-bans-ai-for-quran); the
  primary Dar al-Ifta text was not located.
- The International Islamic Fiqh Academy's Resolution No. 258 (3/26) on artificial intelligence,
  26th session, Doha, 4 to 8 May 2025, sets a default of permissibility subject to ethical
  conditions. It was fetched and does **not** contain a clause specifically on AI issuing fatwa.
  **VERIFIED**, including the negative finding (https://iifa-aifi.org/en/56035.html)

---

## 6. The failure-mode asymmetry

Both error directions cause real harm. They are not symmetric in kind, in who bears them, or in
whether they are recoverable.

### 6.1 False ELIGIBLE

A campaign is badged zakat eligible when a qualified reviewer would not have badged it.

- **The donor's obligation may not be discharged.** Scholars genuinely differ on whether a good-faith
  mistake requires repayment. Islamweb sets out both: "If a person does his best and gives the zakah
  to a person he thinks deserves it but at the end it is concluded that he/she does not deserve it,
  it is said that this will suffice him. so he does not have to pay the zakah again", but "some
  scholars believe that if a person pays the Zakah to some one and finds out that such a person was
  not liable for Zakah, then he has to pay the Zakah again." **VERIFIED**
  (https://www.islamweb.net/en/fatwa/88368/giving-zakah-to-appropriate-recipients)
- **INFERENCE.** Under the second position the donor owes the zakat again and typically does not know
  it. The harm is silent, individual, and unremediable by a platform that cannot identify who was
  affected. It is also a religious harm, not only a financial one: zakat is a pillar obligation, and
  causing a Muslim to believe it is discharged when it is not is worse than misallocating money.
- **INFERENCE.** Platform trust is aggregate and slow to rebuild. LaunchGood's own disclaimer already
  places residual responsibility on the donor, and the Darul Iftaa Canada review already advises
  independent due diligence (1.4). Each publicised false positive strengthens the case that the badge
  is not worth relying on, which erodes the product's reason for existing.

### 6.2 False INELIGIBLE

A campaign is denied the badge when a qualified reviewer would have granted it.

- **INFERENCE.** The campaign loses access to the zakat donor pool at the moment that pool is largest.
  With 78% of zakat donations arriving inside Ramadan (section 1.5), a wrong denial during Ramadan is
  effectively a denial for the year.
- **VERIFIED mitigation.** The campaign is not removed: it can still raise non-zakat funds (section
  1.1), and a contact route exists (zakat@launchgood.com) though no formal appeal process is
  published.
- **INFERENCE.** The harm falls on people who are, by construction, likely to be poor. It is
  concentrated, it is visible to the person harmed, and it is at least partially recoverable if
  surfaced and re-reviewed.

### 6.3 Why the asymmetry pushes toward abstention rather than confidence

**INFERENCE throughout this subsection.**

1. The errors differ in *who can detect them*. A wrongly denied organiser knows immediately and can
   appeal. A donor whose zakat went to an ineligible recipient will almost never find out. Only one
   of the two generates its own corrective signal.
2. They differ in *recoverability*. A denial can be reversed and the campaign re-badged. A
   disbursement cannot be un-disbursed, and the donor's zakat year has passed.
3. A third outcome exists that the binary hides: **insufficient evidence**. Campaign copy is
   marketing prose, not a case file. It rarely states the beneficiary's assets, the structure that
   would satisfy tamlik, who owns an asset afterward, or whether a debt was lawfully incurred.
   Forcing a two-way decision on text that lacks the determinative fact converts a known unknown into
   a confident error in one direction or the other.
4. Confidence scores do not help. A threshold is still a decision, and it would need calibrating
   against a ground truth that is scholarly judgment, which is exactly what section 3 shows to be
   contested. A number implies a calibration that cannot exist here.
5. Sections 3.1, 3.2, 3.3 and 3.6 are not resolvable by better evidence extraction. They resolve only
   by choosing a school or body, which is a religious act. A system that resolves them silently has
   made that choice on the reviewer's behalf and hidden it.
6. So the correct behaviour on hard cases is to stop, name what is missing or contested, and hand the
   file to a human. That costs throughput exactly where throughput is scarcest, which is the real
   price of this design and should be stated rather than hidden.

---

## 7. Design implications for a triage system

**INFERENCE throughout.** Each bullet connects to the section that motivates it.

- **Mandatory span citation on every mapping.** NZF's published standard is that officers "observe
  sufficient evidence to believe" (4.1). A mapping without a quoted span is an assertion, not
  evidence. No span, no supported verdict.
- **Three-valued output per category, never two.** Supported, not supported, insufficient evidence.
  The third value carries most of the real signal (6.3) and is what campaign prose actually warrants.
- **Refuse on scholarly-difference territory, and name the difference.** When the determinative
  question is fi sabilillah scope, tamlik, overhead, or whether mu'allafati qulubuhum operates (3.1,
  3.2, 3.3, 3.6), escalate and say which disagreement was hit. Do not pick a school.
- **Test the claimed category, do not trust it.** Creators self-select from a dropdown (1.1), and the
  same project can be eligible under one heading and not another (1.3). Treat the selection as a
  hypothesis with its own evidence requirement.
- **Emit missing-evidence questions addressed to the organiser.** Sections 3.2 and 3.4 turn on facts
  campaign copy does not contain: is the debt currently due, was it lawfully incurred, who owns the
  asset afterward, does a wakalah or ownership-transfer mechanism exist. Ask, do not infer.
- **Extract structure, do not score.** Beneficiary type (individual, household, community,
  institution), fund destination, ownership transfer, geography, faith of beneficiaries, admin
  deduction, military element. These are the facts the disagreements act on; the disagreements are
  the human's to resolve.
- **Model the policy as data, not as weights.** The one working precedent for automated religious
  classification (5.4) works because named scholars publish fixed rules and software applies them.
  Any threshold here must be externally stated, attributable, and editable without retraining.
- **Never fold the platform's own overhead into a determination.** Admin-cost positions range from 0%
  to 20% among mainstream bodies (3.3). Surface a campaign's stated deduction as an extracted fact,
  do not judge it.
- **Design for the Ramadan spike as the primary load case.** 78% of zakat giving lands in 30 days
  (1.5). The job is to make each reviewer decision faster and better evidenced, not to replace
  reviewers precisely when review capacity binds.
- **Recorded human decision is the only output that ships, and precedent stays reference-only.** Every
  institution surveyed retains named human authority: senior grants officers on complex cases, appeal
  rights, named scholar boards, external Shariah audit (4.1, 4.2). Prior adjudicated cases shown to a
  reviewer are a research aid; fed back to the model they would launder past human decisions into
  present machine ones and make the trust boundary decorative.

---

## OPEN QUESTIONS

Things this research could not establish. Listed so they are not silently treated as settled.

1. **LaunchGood's internal criteria.** The published policy states categories and examples, but not
   the decision rules, the evidence a reviewer requests from an organiser, review turnaround, reviewer
   headcount, or an appeal process. None of this is published; only a contact address is.
2. **Whether LaunchGood's zakat team requests documentation at all.** No published source states
   whether campaign verification involves any evidence beyond the campaign text and the creator's
   self-declared category.
3. **The Saudi Permanent Committee / Ibn Baz narrow position, in primary text.** A binbaz.org.sa
   fatwa URL surfaced in search returned HTTP 404 on fetch, so it is not cited here. The narrow
   position is documented above only through the Hanafi fatwa at islamqa.org and through Dr.
   Siddiqi's secondhand summary. A directly fetchable primary source remains outstanding.
4. **Yusuf al-Qaradawi's Fiqh az-Zakah in primary text.** The broad fi sabilillah position is
   attributed to him by several fetched secondary sources; his own text could not be fetched (403).
   Treat the attribution as reported, not verified.
5. **AAOIFI's Shariah standard on zakat.** Frequently cited, but no free full text or verbatim-quoting
   secondary source could be fetched. Any claim about its exact disbursement wording is unverified.
6. **The IIFA resolution authorising UNHCR.** Verified only through UNHCR's own portal quoting it. It
   was not located on IIFA's published resolutions listing, so the resolution number and primary text
   remain unconfirmed.
7. **Whether Mufti Mohammed Wahaajuddin, author of the Darul Iftaa Canada critique (1.4), is the same
   person as "Mufti Wahajuddin (Hanafi)" named as a policy reviewer on LaunchGood's page.** The names
   are close and the transliteration differs. Not established either way; noted because it would change
   how the critique should be read.
8. **NZF UK's current application volume.** Two vendor case studies give 10,000 and 25,000 per month.
   NZF's own annual report PDF could not be parsed. The 10,000 figure is cited above because its
   source page was fetched and dated; the discrepancy is unresolved.
9. **Whether any zakat institution publishes an inter-rater reliability figure, an error rate, or an
   audit result for eligibility decisions.** Nothing of the kind was found. This matters: without a
   published human baseline there is no honest denominator against which any automated system's
   accuracy could be reported.
10. **Whether false-eligible incidents have ever been documented publicly on any platform.** No case
    study, regulatory action, or published post-mortem was found. The harm model in section 6 is
    therefore reasoned from doctrine and platform disclaimers, not from observed incidents.
11. **Any prior academic or industry work on automated zakat classification of campaign text.** None
    found. Absence of evidence here is weak evidence of absence, since negative results and internal
    tooling are rarely published.
