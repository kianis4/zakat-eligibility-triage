# Design contract

The visual language of a warm, trustworthy Muslim crowdfunding platform, applied to a reviewer
tool. It is a tribute in form only: no other platform's name, logo, or wordmark appears anywhere in
this app, and the product stays itself.

## Ground and ink

| Token | Value | Where |
| --- | --- | --- |
| `--ground` | `#FFFFFF` | page and card background |
| `--tint` | `#F7F8F6` | section fill, quiet notes, table headers |
| `--ink` | `#17251C` | body and heading text, a near-black with a green bias |
| `--muted` | `#5C6B62` | metadata, footnotes, secondary labels |
| `--border` | `#E4E9E5` | every card, input, and rule |

## Green

`--primary` `#00A85A` and `--primary-hover` `#008F4C` carry accents, focus rings, and left borders.
`--primary-tint` `#E6F6EE` fills quiet green notes. Anything that carries text over a green fill
uses `--primary-ink` `#00733F` instead, because white on `#00A85A` measures 3.1:1 and the contract
holds text to 4.5:1. So the primary button and the supported pill are `--primary-ink` fills.

## Semantic states

Supported is a green pill. Not supported is a neutral gray pill, `#EEF1EF` under `#5C6B62`.
Insufficient evidence is an amber pill, `#B45309` on `#FEF3C7`, which measures 4.51:1. Every pill
carries its own words, so state never rests on color alone.

A refusal is a white attention card with a 4px amber left border and an amber heading chip. When
the pipeline did not refuse, the same slot holds a quiet green tint note instead.

## Type

Plus Jakarta Sans via `next/font/google` at 400/600/700/800, falling back to `system-ui`. Headings
run 700 or 800 with tight tracking. Body is 400 at 16px over 1.6. Metadata is 13px in `--muted`.
Story and prose sit at about 68ch, which is a reading measure rather than the container width.

## Shape

Cards are 16px rounded with a border and `0 1px 3px rgba(23, 37, 28, .06)`. Buttons and chips are
full pills. The primary button is a green pill with white 600 text and generous padding. Inputs are
10px rounded and take a green focus ring. Focus is always visible, never removed.

## Provenance

The three labels become small uppercase chips. Model prose is amber tinted, corpus text is green
tinted, and a campaign quote is neutral with a left quote bar. The legend keeps its sentences.

## Rules

Plain CSS in `src/app/globals.css`, no Tailwind and no UI dependency beyond `next/font`. Section
titles, labels, and body copy are byte-identical to what the tests and the video runbook anchor on,
so a visual change is a restyle and never a rewording.
