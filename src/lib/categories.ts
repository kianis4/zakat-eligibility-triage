import { createHash } from "node:crypto";

/**
 * The eight categories of zakat recipient named in Qur'an 9:60, as the triage pipeline
 * refers to them.
 *
 * The identifiers are the standard transliterations used throughout `docs/RESEARCH.md`
 * section 2, slugged. They are stable keys, not display strings: the gloss is the English
 * rendering a reviewer reads, and `evidenceGuidance` is what campaign text would have to
 * say for the category to come into play at all. Nothing here settles a category; the
 * contested ones are handled as difference data below.
 */
export const RECIPIENT_CATEGORY_IDS = [
  "al-fuqara",
  "al-masakin",
  "al-amilina-alayha",
  "al-muallafati-qulubuhum",
  "fi-al-riqab",
  "al-gharimin",
  "fi-sabilillah",
  "ibn-al-sabil",
] as const;

export type RecipientCategory = (typeof RECIPIENT_CATEGORY_IDS)[number];

export type RecipientCategoryDefinition = {
  readonly id: RecipientCategory;
  readonly gloss: string;
  readonly evidenceGuidance: string;
};

export const RECIPIENT_CATEGORIES: readonly RecipientCategoryDefinition[] = [
  {
    id: "al-fuqara",
    gloss: "the poor",
    evidenceGuidance:
      "Those whose wealth falls below the threshold at which zakat becomes payable, which National Zakat Foundation UK operationalises as net zakatable and unused personal assets below the nisab. Bearing text names an individual or household beneficiary, states a financial position such as income, assets, or debts, asserts an inability to meet basic needs, or says whether the money reaches a person rather than an institution. Sources disagree over whether al-fuqara or al-masakin denotes the more destitute state, so text that establishes material need without ranking it bears on both.",
  },
  {
    id: "al-masakin",
    gloss: "the needy",
    evidenceGuidance:
      "The adjacent category of material need, glossed by National Zakat Foundation UK as people whose earnings do not cover their basic needs, and by Hanafi sources as those with no earnings at all. Bearing text gives subsistence-level detail rather than aggregate need language: specific unmet basic needs such as food, shelter, or medicine, household size, absence of income. Islamic Relief reads the pairing of the two words as covering the poor and the ultra-poor, so the split from al-fuqara is a matter for the reviewer, not for the text.",
  },
  {
    id: "al-amilina-alayha",
    gloss: "those employed to administer it",
    evidenceGuidance:
      "Those appointed to collect and distribute zakat, compensated for that labour. This is the doctrinal route by which an organisation charges administrative cost to zakat. Bearing text says the campaign is raising for its own delivery or collection costs, states an administrative deduction or platform fee, or shows whether the raising entity is also the distributing entity. The permissible amount is contested and the campaign's stated deduction is a fact to surface, never a figure to judge.",
  },
  {
    id: "al-muallafati-qulubuhum",
    gloss: "those whose hearts are to be reconciled",
    evidenceGuidance:
      "Those given zakat to incline or reassure them toward Islam or the Muslim community. Bearing text describes new Muslim support, convert care, or community relations work, or states the faith or affiliation of the beneficiaries. Whether the category still operates at all is disputed, so text that lands here calls for the difference to be named rather than for a verdict.",
  },
  {
    id: "fi-al-riqab",
    gloss: "freeing those in bondage",
    evidenceGuidance:
      "Historically the manumission of slaves and the ransom of captives. Institutions reinterpret rather than retire it: Islamic Relief applies it to bonded labour, forced labour, and trafficking, and AMJA extends it to bail and the legal defence of the unjustly imprisoned, while LaunchGood's own policy states the category no longer applies today. Bearing text describes trafficking or bonded labour, bail, ransom, or unjust detention, and says whether the funds free a specific person or fund an advocacy programme.",
  },
  {
    id: "al-gharimin",
    gloss: "those in debt",
    evidenceGuidance:
      "Those unable to discharge a debt from their own means, defined by National Zakat Foundation UK as those whose liabilities exceed their zakatable and surplus assets. Bearing text names a creditor and an amount, says what the debt was incurred for, says whether it is currently due, says whether the debtor holds assets, or says whether the debt was taken on to reconcile a dispute between others. The school positions turn on those facts, so a bare statement of owing money supports far less than it appears to.",
  },
  {
    id: "fi-sabilillah",
    gloss: "in the path of God",
    evidenceGuidance:
      "The category whose scope is most disputed and most consequential for campaigns, read narrowly as armed struggle and, on some accounts, those unable to complete Hajj, and broadly as da'wah, education, health, and public benefit works. Bearing text claims a general public-benefit purpose, says whether beneficiaries are individuals or an institution, says whether an asset is built and who owns it afterward, places the work in a Muslim minority setting, or mentions any military element. Because both readings have named holders, text here is evidence of what the campaign does, never of which reading applies.",
  },
  {
    id: "ibn-al-sabil",
    gloss: "the wayfarer",
    evidenceGuidance:
      "A traveller cut off from their means, entitled to zakat to reach home even if wealthy where they came from. UNHCR applies the category to refugees and internally displaced people, and Islamic Relief defines travellers as 48 or more miles from home. Bearing text describes displacement, refugee or asylum status, or stranded travel, gives distance from home, or says whether the beneficiary retains assets elsewhere that they cannot reach.",
  },
];

/**
 * Where a cross-cutting restriction actually bites.
 *
 * `donor` restrictions are conditions on an individual giver's own zakat, and a
 * crowdfunding campaign cannot know who its donors will be. Those are context a reviewer
 * needs, not something campaign text can be assessed against. `recipient` restrictions are
 * conditions on who receives, which campaign text can sometimes speak to.
 */
export type RestrictionBinding = "donor" | "recipient";

export type CrossCuttingRestriction = {
  readonly id: string;
  readonly summary: string;
  readonly whereItBinds: RestrictionBinding;
  readonly evidenceGuidance: string;
};

/**
 * Restrictions from `docs/RESEARCH.md` section 2 that apply regardless of which of the
 * eight categories is in play.
 *
 * They are recorded here as data with the same intent as the difference list: the
 * escalation stage and the reviewer UI, both later issues, are the deterministic consumers.
 * Nothing in this module applies them, and the mapping step does not either, because a
 * restriction is a condition on a payment rather than a reading of campaign text.
 */
export const CROSS_CUTTING_RESTRICTIONS: readonly CrossCuttingRestriction[] = [
  {
    id: "immediate-family",
    summary:
      "Islamic Relief states that the recipient must not belong to your immediate family: a spouse, children, parents and grandparents cannot receive your zakat.",
    whereItBinds: "donor",
    evidenceGuidance:
      "No campaign text can settle this, because the restriction runs between a particular donor and a particular recipient, and a campaign does not know who will give to it. Surface it to the reviewer as context on campaigns raising for a named individual, where some prospective donors may be excluded while others are not. Note that this is a different question from the organizer's own relationship to the beneficiary, which the extraction step records as a claim.",
  },
  {
    id: "hashimi-descent",
    summary:
      "Islamic Relief states that the recipient must not be a Hashimi, a descendant of the Prophet (PBUH).",
    whereItBinds: "recipient",
    evidenceGuidance:
      "Campaign copy almost never states lineage, so absence of any mention is the normal case and is not evidence either way. Where a story does state descent from the Prophet's family, that is a fact for the reviewer to weigh, not a conclusion for the pipeline to draw.",
  },
  {
    id: "recipient-must-be-muslim",
    summary:
      "National Zakat Foundation UK's policy, working explicitly on Hanafi criteria, requires that the zakat applicant be a Muslim. Whether zakat may go to a non-Muslim recipient at all is itself disputed, which is recorded in the scholarly-difference list rather than settled here.",
    whereItBinds: "recipient",
    evidenceGuidance:
      "Campaign text sometimes speaks to this: an organization's stated mission, the community it serves, or an explicit statement about the beneficiaries' faith. Record what the text says and leave the requirement's application to the reviewer, whose position on the underlying disagreement determines what the statement is worth.",
  },
];

/**
 * The closed set of differences the pipeline is allowed to name.
 *
 * The ids are how a difference is selected rather than described: the model picks one of
 * these and the server resolves it to the entry below, so no description of a scholarly
 * position is ever model-authored. See ADR-0007. They are stable keys and outlive edits to
 * the summaries they point at, which is what makes `POLICY_VERSION` the thing that moves
 * when the wording changes.
 */
export const SCHOLARLY_DIFFERENCE_IDS = [
  "fi-sabilillah-scope",
  "fi-sabilillah-tamlik",
  "amilina-overhead",
  "muallafati-still-operative",
  "muallafati-non-muslim-recipient",
  "gharimin-debt-conditions",
  "ibn-al-sabil-displacement",
] as const;

export type ScholarlyDifferenceId = (typeof SCHOLARLY_DIFFERENCE_IDS)[number];

export type ScholarlyDifference = {
  readonly id: ScholarlyDifferenceId;
  readonly category: RecipientCategory;
  readonly topic: string;
  readonly summary: string;
};

/**
 * The territories where recognised scholars genuinely differ, from `docs/RESEARCH.md`
 * section 3, as data rather than prose.
 *
 * Escalation logic downstream reads this list, so each entry names the category it
 * attaches to and states the disagreement without resolving it. Every summary presents
 * both sides; a summary that came out one-sided would quietly hand the pipeline a school.
 */
export const SCHOLARLY_DIFFERENCES: readonly ScholarlyDifference[] = [
  {
    id: "fi-sabilillah-scope",
    category: "fi-sabilillah",
    topic: "scope of fi sabilillah",
    summary:
      "A Hanafi fatwa by Shaykh Sohail Hanif restricts the category to those fighting in the way of Allah and those unable to complete Hajj, the recipient still needing to be legally poor, and characterises the broad modern reading as aberrant. AMJA adopts the widest surveyed position, covering da'wah, defence of the religion, and the overhead of delivering it. Dr. Muzammil Siddiqi takes a middle position: extra charity is better for building work, but zakat for mosques and schools is not forbidden, especially in non-Muslim countries. Two AMJA fatwas twelve years apart reach opposite conclusions on mosques.",
  },
  {
    id: "fi-sabilillah-tamlik",
    category: "fi-sabilillah",
    topic: "tamlik on project campaigns",
    summary:
      "Tamlik, the transfer of ownership of zakat to a needy person, is the doctrinal engine under the fi sabilillah dispute: the Hanafi position holds it is why zakat cannot build a mosque, the recipient having to be both needy and a person. Two operational answers are documented rather than one: National Zakat Foundation UK uses a wakalah agency agreement that vests ownership in the recipient, and Islamic Relief transfers ownership of a completed communal asset to the local community. AMJA's public reasoning route does not engage tamlik as a separate hurdle in the sources reviewed, arguing through fi sabilillah scope instead, which is an absence in the record rather than a position AMJA states. For a project campaign the determinative question is therefore which mechanism exists, which campaign copy usually does not state.",
  },
  {
    id: "amilina-overhead",
    category: "al-amilina-alayha",
    topic: "organisational overhead charged to zakat",
    summary:
      "There is no single permissible figure among bodies that all consider themselves within the rules. The International Islamic Fiqh Academy conditioned its authorisation of UNHCR's fund on zero deduction; National Zakat Foundation UK caps a distribution-service contribution at 10 percent and takes no core costs; Islamic Relief Worldwide states 12.5 percent; Islamic Relief USA states 20 percent; Muslim Hands argues that 100 percent claims are structurally misleading because the cost lands somewhere else regardless. A campaign's stated deduction is a fact to surface, not a figure to rule on.",
  },
  {
    id: "muallafati-still-operative",
    category: "al-muallafati-qulubuhum",
    topic: "whether the category still operates",
    summary:
      "Darul Iftaa Birmingham holds the category abrogated, attributing that to Malik, al-Thawri, Ishaq ibn Rahawayh and Abu Hanifah, and Darul Qasim reports that no Rightly Guided Caliph paid it after Umar's decision. SeekersGuidance reads the same history the other way, as an absence of need rather than an abrogation. The Fiqh Council of North America, in a fatwa dated January 2026 signed by Dr. Yasir Qadhi, Dr. Muzammil Siddiqi, Dr. Hatem al-Haj and others, holds the ruling unabrogated and applicable. This is a live and currently moving disagreement between contemporary bodies.",
  },
  {
    id: "muallafati-non-muslim-recipient",
    category: "al-muallafati-qulubuhum",
    topic: "whether zakat may go to a non-Muslim recipient",
    summary:
      "The general restriction, as al-feqh states it, is that zakat may not be given to non-Muslims except under al-mu'allafatu qulubuhum, which is why this question and the operative-status question move together. Islamic Relief's operating position is narrower than a blanket ban: where other funds are not available, zakat may be used for non-Muslims in Muslim-majority areas. National Zakat Foundation UK's policy, on Hanafi criteria, requires the applicant to be a Muslim.",
  },
  {
    id: "gharimin-debt-conditions",
    category: "al-gharimin",
    topic: "conditions on debt",
    summary:
      "The schools agree that someone able to repay from their own means is not eligible, and Maliki, Shafi'i and Hanafi positions require the debt to have been lawfully incurred. The Maliki school excludes debt taken on deliberately to qualify. Shafi'i and Hanbali positions recognise debt taken on to reconcile feuding parties even where the debtor is not personally poor. Egypt's Dar al-Ifta separates lawful debt, unlawful debt followed by repentance, and unrepented unlawful debt. The disagreements act mostly on facts campaign copy rarely states: whether the debt is due, and whether the debtor can pay.",
  },
  {
    id: "ibn-al-sabil-displacement",
    category: "ibn-al-sabil",
    topic: "modern application to displaced people",
    summary:
      "Applying the category to refugees and internally displaced people is mainstream rather than fringe: UNHCR grounds it in the classical traveller definition plus a modern Hanafi extension to those separated from their wealth by upheaval, and Zakat Foundation of America places refugees primarily under al-gharimin and secondarily here. LaunchGood declines to verify traveller campaigns at all, on practical rather than doctrinal grounds, which is a platform position rather than a scholarly one and should not be read as a third opinion.",
  },
];

const SCHOLARLY_DIFFERENCE_BY_ID = new Map(
  SCHOLARLY_DIFFERENCES.map((difference) => [difference.id, difference]),
);

/**
 * Resolves a selected id to the human-authored entry it names.
 *
 * The id is the only thing a model is allowed to supply about a scholarly difference, so
 * this is the single door between a selection and the text a reviewer reads. It throws on
 * an id the corpus does not hold rather than returning undefined: an unknown id has already
 * failed the schema that only accepts the closed set, so reaching here with one is a broken
 * invariant, and the alternative is a finding whose difference silently disappears.
 */
export function scholarlyDifferenceById(id: ScholarlyDifferenceId): ScholarlyDifference {
  const difference = SCHOLARLY_DIFFERENCE_BY_ID.get(id);

  if (difference === undefined) {
    throw new Error(`No scholarly difference is recorded under the id ${JSON.stringify(id)}.`);
  }

  return difference;
}

/**
 * Everything in this module that a mapping is produced against.
 *
 * The three lists together are the policy corpus: the guidance the model reads, the
 * differences it may name, and the restrictions a reviewer weighs. A change to any of them
 * changes what an output means, which is why they are versioned together rather than apart.
 */
export type PolicyCorpus = {
  readonly categories: readonly RecipientCategoryDefinition[];
  readonly differences: readonly ScholarlyDifference[];
  readonly restrictions: readonly CrossCuttingRestriction[];
};

/**
 * Serialises a value with its object keys in a fixed order, so the hash tracks the content
 * rather than the order someone happened to type the fields in. Reordering the keys of an
 * entry is not a policy change and must not read as one.
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

/**
 * The identifier of a policy corpus, as a short content hash.
 *
 * A hash rather than a number someone remembers to raise, because the failure mode of a
 * hand-maintained version is silence: an edit lands, the number stays, and every historical
 * output produced under the old wording becomes indistinguishable from one produced under
 * the new. Twelve hex characters tell two corpora apart in a reviewer's file without
 * becoming an identifier anyone tries to read.
 */
export function policyVersionOf(corpus: PolicyCorpus): string {
  return createHash("sha256").update(canonicalize(corpus)).digest("hex").slice(0, 12);
}

/**
 * The version of the corpus this build carries, computed once at module load.
 *
 * `mapCategories` stamps it onto every mapping. It is never model-supplied: the stamp says
 * which policy the pipeline mapped against, and a model that could set it could date its own
 * output to a policy it never read.
 */
export const POLICY_VERSION = policyVersionOf({
  categories: RECIPIENT_CATEGORIES,
  differences: SCHOLARLY_DIFFERENCES,
  restrictions: CROSS_CUTTING_RESTRICTIONS,
});
