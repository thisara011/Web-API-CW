# Final coursework checklist and viva rehearsal

These are AI-assisted working notes, not report prose. The brief requires the student to write the report and sign the declaration themselves. Do not submit this file as the report.

## Remaining completion gates

- [ ] Resolve D1 in PROJECT_PLAN.md: which mutable resource and principal satisfy full CRUD while readings remain immutable and analysts remain read-only?
- [ ] Implement and verify that agreed HTTP CRUD path, including replacement, preconditions, repeated requests and deletion restrictions.
- [x] Select hosting/account and budget; deploy Azure App Service and PostgreSQL. See AZURE_WEBAPP.md.
- [x] Verify public HTTPS, live Swagger, private demonstration credentials and persistence after restart. See Azure HTTP evidence.
- [ ] Verify current synthetic coverage immediately before the marking demonstration; a past successful check does not stay fresh indefinitely.
- [ ] Confirm a successful CI run, container build and repository access for the named module leader.
- [ ] Write the six required report sections in the student's own words, 2250–2750 words. PROJECT_PLAN.md contains an evidence-based outline and suggested budget.
- [ ] Assemble the actual AI prompt/code-assistance appendix, including review corrections recorded in AI_ASSISTANCE_LOG.md. Retain the original conversation/export; this log is a summary, not a verbatim transcript.
- [ ] Review and sign the actual coursework declaration.
- [ ] Confirm the LMS deadline, required upload filenames/formats and the applicable guideline edition.
- [ ] Rehearse the viva and attend it.

No grade or complete-coursework claim follows merely from passing local tests.

## Evidence to explain in the report

| Section | Questions for the student's own explanation | Repository evidence |
| --- | --- | --- |
| Architecture/data | Why a relational hierarchy? Why no separate Device entity? Why immutable observations and fixed decimal units? | PROJECT_PLAN.md, DATABASE.md, SQL migrations |
| API design | How do atomic, paginated, composite and derived resources differ? Why these URIs, status codes and cache validators? | API_DESIGN.md, openapi/openapi.json, HTTP tests |
| Security | How does an operation scope differ from a jurisdiction predicate? How are changed roles and rotated credentials handled? | src/middleware/auth.ts, authentication/hierarchy services, boundary tests |
| Deployment | How can another person reproduce the actual release? How are owner/runtime credentials separated and stale synthetic data refreshed? | DEPLOYMENT.md plus actual hosted evidence |
| Maturity | Which resource identities, methods and statuses demonstrate Richardson Level 2? What application-wide hypermedia controls are absent? | Real request/response examples; pagination alone is not Level 3 |
| Evaluation | Which generated defects were found and fixed? Which limitations remain? What measurements actually support the conclusions? | AI_ASSISTANCE_LOG.md, dated evidence, measured smoke timings |

## Suggested live walkthrough

1. Show the six-entity model and identify where jurisdiction comes from.
2. Authenticate a national and district analyst; compare scoped counts, then attempt a hidden resource with If-None-Match.
3. Authenticate a device; append its own observation, inspect 201 and Location, and retrieve it as an analyst.
4. Repeat the timestamp to show 409; try a different device's installation to show 403.
5. Page and filter history. Explain the half-open time window and stable tie-breaker.
6. Revalidate a representation with an ETag to show bodyless 304; use a stale If-Match to show 412.
7. Calculate a daily-energy delta from an exact local-midnight counter and explain missing/stale coverage rather than summing counters.
8. Demonstrate the agreed CRUD workflow once D1 is resolved; 405 alone does not demonstrate CRUD.
9. Restart the deployed API and demonstrate persistent data and live Swagger.
10. Explain one genuine generated-code defect and its regression test without reading a prepared script.
