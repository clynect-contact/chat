# Evaluation status

This report separates verified staging behavior from production acceptance. Fixture extraction is not a substitute for a live model evaluation.

## Verified

- 59 automated checks pass: 40 controlled bilingual/adversarial scenarios and 19 additional validation, authorization and document tests.
- HTTP integration checks pass for mission intake, DOCX profile intake, private saves, reload, repeated action/request IDs, anonymous write denial, cross-user access denial, same-origin enforcement, active-role restrictions and consented support handoff.
- Browser mission intake, demo sign-in, private save and reload pass.
- The profile journey passes with a fictional DOCX upload and keyboard activation of role, upload consent, send and save controls.
- An injected HTTP provider failure preserves the composer input and can be retried successfully; this simulates a provider failure rather than calling a live provider.
- No horizontal overflow on the welcome or conversation views at 320, 375, 768, 1024 and 1440 pixels.
- The mobile review sheet opens and closes with Escape.
- No browser runtime errors or automated axe accessibility violations were observed in the tested profile conversation view.
- TypeScript, owned-source lint and the deployment build pass.

## Release gates still pending

- Live AI extraction: the ≥95% mission capture / CV precision targets and ≥90% conversation pass rate have not been measured. No provider credential was available. The controlled tests exercise fixture mode and selected field assertions only.
- The corpus covers the ten requested technical stack families, but needs a broader manually labeled set of realistic, varied CVs/briefs and independent judgments before release.
- Real matching, plan entitlements, blocked-company filtering and secret-profile privacy cannot be integration-tested until Clynect supplies its authorized services. These paths fail closed rather than returning invented results.
- Real support delivery, production authentication, staging hosting and production storage integration remain unconnected.
- Provider latency targets, prolonged outage behavior, mobile hardware keyboard behavior, comprehensive screen-reader testing require further verification.
- Legal/privacy copy and data retention require Clynect approval. The shipped knowledge is explicitly a staging source.

## Manual demo

1. Open a new session and select the recruiter intent.
2. Use the French fictional example or enter a brief. Correct a field in the review card and save; sign into the isolated demo session when prompted.
3. Switch to a new freelancer conversation. Upload a fictional PDF/DOCX with consent, send the prepared message and confirm missing availability/rates/visibility.
4. Save the profile and reopen it from My drafts.
5. Ask a pricing question. Verify that missing active pricing leads to an explicit handoff, without a fabricated price.
6. Preview a support request. Verify the last five messages, consent and the explicit staging-only, not-sent result.
7. Try an anonymous save or wrong-role tool request; the server must deny it.

Four moderate advisories remain in the development-only Drizzle migration toolchain. High-severity starter advisories were removed with compatible framework/toolchain upgrades; production dependencies are audited separately.

The optional WebMCP staging hook is feature-detected. Native WebMCP execution has not been verified in this browser.

Browser screenshots and the detailed accessibility report are generated under ignored `outputs/`. Do not interpret a passing fixture corpus or absence of critical automated violations as full WCAG or production security certification.
