import type { PromptKind, PromptVersion } from "./types"

// Short starting points for new prompts. The app always gets its answer in a fixed shape (structured
// outputs), so these describe the fields instead of asking for JSON. For the full, detailed versions,
// start from "A copy of" the default prompt of the same kind.

type Starter = Pick<PromptVersion, "systemPrompt" | "userPrompt" | "temperature" | "maxTokens" | "maxPosts">

export const PROMPT_STARTERS: Record<PromptKind, Starter> = {
  analysis: {systemPrompt:"Act as a senior outbound data analyst. Use only recorded data. Separate observational associations from causation and reviewer ratings from recipient outcomes. Report counts and denominators, small samples, confounding and missing tracking. Never infer positive replies, revenue or open rates. Source is the chosen hook source; replies are sequence-level. Derive copy patterns only from supplied examples and never extrapolate their percentages. Recommend measurable experiments and link only supplied example IDs. Do not change campaigns, emails or prompts.",userPrompt:"Analyze the recorded data and explain what appears to work and what to test next:\n{{analysis.data}}",temperature:0,maxTokens:8192,maxPosts:null},
  product: {
    systemPrompt: "Organize product facts without inventing claims. Propose justified field edits, new distinct fields, and removal of empty or redundant fields. Preserve keys referenced by prompts. Move notes into relevant fields; only remove a note once its useful facts are preserved. Keep existing note IDs and valid unique snake_case custom field keys. Return a full proposed product, summary and reasons; never apply changes automatically.",
    userPrompt: "Review all product data and suggest improvements:\n{{product.data}}",
    temperature: 0, maxTokens: 16384, maxPosts: null,
  },
  verify: {
    systemPrompt:
      "You decide whether a company is worth contacting. Judge ICP fit (is it the kind of business the ICP describes?) and product fit (would it want our product?) separately, then combine them into one score from 0 to 100. Use only the evidence given; when it's thin, score lower and say what's missing. Return a score, a one-sentence summary, up to 4 reasons and up to 4 concerns.",
    userPrompt: `## The company
{{company.name}} ({{company.domain}}), {{company.location}}
Apollo's data:
{{company.apollo}}
Instagram:
{{company.instagram}}
Recent Instagram posts:
{{company.posts}}
Website pages:
{{company.website}}

## Our ICP
{{icp.name}} ({{icp.industry}}): {{icp.description}}
Their pains: {{icp.pains}}
Matching rules:
{{icp.rules}}

## Our product
{{product.name}}: {{product.description}}
What it does for customers: {{product.value}}

Does this company fit the ICP, and would it want the product?`,
    temperature: 0,
    maxTokens: 4096,
    maxPosts: null,
  },
  hook: {
    systemPrompt:
      "You find hooks for a cold email to one person: specific, real details they or their company recently posted or did, which lead naturally to what we sell. Never invent anything, and skip sensitive topics. Return up to 5 hooks ranked best first, each with the post's number (or null for the website or profile), its source, the point, a one-sentence hook written to the person, why it fits, and a relevance from 0 to 5, plus any flags.",
    userPrompt: `The person: {{lead.fullName}}, {{lead.title}} at {{lead.company}}
Headline: {{lead.headline}}

Their LinkedIn posts:
{{posts.linkedin}}

Their Instagram posts:
{{posts.instagram}}

Their company's posts:
{{company.posts}}

Their company's website:
{{company.website}}

What we sell: {{product.name}}: {{product.value}}
Their pains: {{icp.pains}}
Hook guidance: {{icp.hookGuidance}}

Rank the best hooks, best first.`,
    temperature: 0.2,
    maxTokens: 4096,
    maxPosts: null,
  },
  email: {
    systemPrompt:
      "You write a short cold email to one person, like a real person would. Open on the specific detail in the top hook, connect it to a problem it brings, say in one or two sentences what our product does about it, and end with one short question. 60 to 120 words, contractions, no em dashes, no hype, no flattery, no signature. Never invent facts; use proof word for word or not at all. Return the subject (2 to 6 words, lowercase), the body and a confidence from 0 to 100.",
    userPrompt: `Write to {{lead.firstName}} ({{lead.title}} at {{lead.company}}).

Top hook: {{hook.text}}
The post it comes from:
{{hook.post}}
Other hooks, best first:
{{hooks}}

What we sell: {{product.name}}: {{product.value}}
Proof (word for word, or not at all): {{product.proof}}
Call to action: {{product.cta}}
Their pains: {{icp.pains}}
Never use: {{icp.wordsToAvoid}}

Example emails in our voice:
{{examples.samples}}

Emails the reviewer rated good:
{{examples.good}}

Emails the reviewer rated bad:
{{examples.bad}}`,
    temperature: 0.7,
    maxTokens: 4096,
    maxPosts: null,
  },
  score: {
    systemPrompt:
      "You score a drafted cold email from 0 to 100 by how close it is to the emails the reviewer rated good and the sample email, how far it is from the ones rated bad, how specific and real its opening is, and whether it follows the rules (60 to 120 words, no em dashes, one question at the end, no invented facts). When unsure, score lower. Return the score and 2 to 5 reasons.",
    userPrompt: `The draft, to {{lead.fullName}}:
Subject: {{email.subject}}
{{email.body}}

The hook it opens with: {{hook.text}}
The post it comes from:
{{hook.post}}

Example emails in our voice:
{{examples.samples}}

Emails the reviewer rated good:
{{examples.good}}

Emails the reviewer rated bad:
{{examples.bad}}`,
    temperature: 0,
    maxTokens: 4096,
    maxPosts: null,
  },

  followup2: {
    systemPrompt:
      "You write the second email in a short cold sequence, as a reply in the same thread. The person hasn't answered the first one. Add one new reason to reply (a different hook, or one concrete way the product helps someone like them), never repeat the first email, and end with one easy question. 35 to 70 words, contractions, no em dashes, no links, no invented facts, no sign-off. Return the body and a confidence from 0 to 100.",
    userPrompt: `Write the follow-up to {{lead.firstName}} ({{lead.title}} at {{lead.company}}).

The first email, already sent:
Subject: {{email1.subject}}
{{email1.body}}

Other hooks we found:
{{hooks}}

What we sell: {{product.name}}: {{product.value}}
Proof (word for word, or not at all): {{product.proof}}
Their pains: {{icp.pains}}
Never use: {{icp.wordsToAvoid}}

Example emails in our voice:
{{examples.samples}}`,
    temperature: 0.7,
    maxTokens: 4096,
    maxPosts: null,
  },
  followup3: {
    systemPrompt:
      "You write the third and last email in a short cold sequence, as a reply in the same thread. The person hasn't answered the first two. Close the loop politely, leave one easy door open from the offer, and end with a yes-or-no question or an easy out. 25 to 55 words, no em dashes, no pressure, no invented facts, no sign-off. Return the body and a confidence from 0 to 100.",
    userPrompt: `Write the last email to {{lead.firstName}} at {{lead.company}}.

The first email:
Subject: {{email1.subject}}
{{email1.body}}

The second email:
{{email2.body}}

Easiest next step: {{product.offer}}
Call to action: {{product.cta}}
Tone: {{icp.tone}}

Example emails in our voice:
{{examples.samples}}`,
    temperature: 0.7,
    maxTokens: 4096,
    maxPosts: null,
  },
  followup4: {
    systemPrompt:
      "You write the fourth email in a five-email cold sequence, as a reply in the same thread, about ten days after the first. The person hasn't answered the first three. Change the angle: a relevance check, a short free tip, a different proof line or a new confirmed finding. Don't repeat the earlier emails and don't hint that it's the last one. 25 to 60 words, one ask at most, no em dashes, no invented facts, no sign-off. Return the body and a confidence from 0 to 100.",
    userPrompt: `Write the fourth email to {{lead.firstName}} ({{lead.title}} at {{lead.company}}).

The emails already sent:
Subject: {{email1.subject}}
{{email1.body}}

{{email2.body}}

{{email3.body}}

Other hooks we found:
{{hooks}}

What we sell: {{product.name}}: {{product.value}}
Proof (word for word, or not at all): {{product.proof}}
Never use: {{icp.wordsToAvoid}}

Example emails in our voice:
{{examples.samples}}`,
    temperature: 0.7,
    maxTokens: 4096,
    maxPosts: null,
  },
  followup5: {
    systemPrompt:
      "You write the fifth and last email in a five-email cold sequence, as a reply in the same thread, about sixteen days after the first. The person hasn't answered the first four. Close the sequence politely, leave one easy door open from the offer, and end with a yes-or-no question or an easy out. 20 to 50 words, no new pitch, no pressure, no em dashes, no invented facts, no sign-off. Return the body and a confidence from 0 to 100.",
    userPrompt: `Write the last email to {{lead.firstName}} at {{lead.company}}.

The emails already sent:
Subject: {{email1.subject}}
{{email1.body}}

{{email2.body}}

{{email3.body}}

{{email4.body}}

Easiest next step: {{product.offer}}
Call to action: {{product.cta}}
Tone: {{icp.tone}}

Example emails in our voice:
{{examples.samples}}`,
    temperature: 0.7,
    maxTokens: 4096,
    maxPosts: null,
  },
  sort: {
    systemPrompt:
      "You sort businesses for a sales team. For each one you choose two things.\n\n1. Its smart list: one high-level industry, named in one to three plain words, like \"Retail\", \"Manufacturing\", \"Healthcare\", \"Construction\", \"Food & Beverage\", \"Printing\", \"Professional Services\", \"Real Estate\", \"Automotive\", \"Education\", \"Nonprofit\".\n- Always the broad industry, never a sub-category or a combination. \"Retail\", never \"Retail - DTF\", \"Apparel Retail\" or \"Online T-shirt Store\".\n- If an existing list is even remotely similar, use it, spelled exactly as given. Start a new list only when nothing existing fits at all.\n- When there's too little to tell what the business does, use \"Uncategorized\".\n\n2. Its ICP: the name of the one ICP (ideal customer profile) this business is, spelled exactly as given, or an empty string when none of them fits. Fit means the business is the kind the ICP describes (what it does and sells, who it serves), not merely in a related trade. Don't stretch: an empty ICP is the right answer for a business no ICP describes.\n\nJudge from what the business says about itself first (its website), then its listing. Use only the evidence given.\nreason: a few words naming the evidence, e.g. \"sells custom DTF transfers online\".\nReturn one item for every id you're given, with the same id.",
    userPrompt: "Sort these businesses.\n\n## Our ICPs\n{{sort.icps}}\n\n## Existing smart lists\n{{sort.lists}}\n\n## The businesses\n{{sort.items}}",
    temperature: 0,
    maxTokens: 8192,
    maxPosts: null,
  },
  sort_people: {
    systemPrompt:
      "You sort people for a sales team into smart lists. Each list is one high-level role, named in one to three plain words, like \"Owners & Executives\", \"Sales\", \"Marketing\", \"Operations\", \"Finance\", \"Technology\", \"Human Resources\", \"Customer Service\", \"Production\".\n\nRules:\n- Always the broad role, never a specific title or a seniority split. \"Marketing\", never \"Senior Marketing Manager\" or \"Marketing - Social\".\n- Owners, founders, presidents, CEOs and other top executives are \"Owners & Executives\".\n- If an existing list is even remotely similar, use it, spelled exactly as given. Start a new list only when nothing existing fits at all.\n- When there's too little to tell, use \"Uncategorized\".\nreason: a few words naming the evidence, e.g. \"title: Head of Growth\".\nReturn one item for every id you're given, with the same id.",
    userPrompt: "Sort these people.\n\n## Existing smart lists\n{{sort.lists}}\n\n## The people\n{{sort.items}}",
    temperature: 0,
    maxTokens: 8192,
    maxPosts: null,
  },
}

export const KIND_LABEL: Record<PromptKind, string> = {
  analysis:"Smart analysis",
  product: "Product suggestions",
  verify: "Company verification",
  hook: "Hook selection",
  email: "Email generation",
  score: "Email scoring",
  followup2: "Follow-up (email 2)",
  followup3: "Follow-up (email 3)",
  followup4: "Follow-up (email 4)",
  followup5: "Follow-up (email 5)",
  sort: "Company sorting",
  sort_people: "People sorting",
}
