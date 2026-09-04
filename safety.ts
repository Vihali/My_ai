// Safety layer: deterministic policy checks applied before any engine or LLM call.

const SEXUAL_RE =
  /\b(sex|sexually|sexual|sexy|porn|porno|pornograph\w*|xxx|nsfw|nude|nudes|nudity|naked|onlyfans|blowjob|blow job|handjob|hand job|masturbat\w*|boob\w*|pussy|dick pic|penis|vagina|vulva|erotic\w*|sexting|cam ?girl|hentai|fetish\w*|orgasm\w*|cum ?shot|fap\w*|incest|threesome)\b/i;

const SEXUAL_BN = /(সেক্স|যৌন|পর্ন|চটি|হস্তমৈথুন)/;

export function isSexualContent(text: string): boolean {
  return SEXUAL_RE.test(text) || SEXUAL_BN.test(text);
}

export const SEXUAL_DECLINE = `That's outside my policy — I don't engage with sexual content. 🙏

No judgment, just a firm boundary. I'm happy to help with almost anything else: studies, work, plans, decisions, code, math, or just a good conversation.

What would you like to do instead?`;
