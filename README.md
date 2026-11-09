# OurCampus project viewers

Recovery of the already public campus viewer emailed October 4, 2026, and Bendac collection emailed November 5, 2026. There are no private workspace files or finance documents in this release.

The base campus, performance hall and two hillside shells match the original published model hashes. The original viewer's comparison remains available; the alternate Option 02 mesh and native 02/05 downloads could not be retrieved from the offline origin and are not linked in this copy. The six older alternatives are a separate project in the OurCampus work index.

Pages reconstructs the large Option 05 model from its lossless archive before publishing. The browser receives the original GLB. Run `sha256sum -c release.sha256` after decompressing to check the release.

The live public mirror is [OurCampus viewers](https://ourcampus-viewers.hv-e48a1b.workers.dev/). The Cloudflare Worker serves only paths in the release manifest from a pinned public GitHub commit; it does not contact either Mac or the Hive box. To publish a verified asset revision, push the release and run `deploy/publish-cloudflare.sh <pushed-commit>` from Hugo’s authorized Cloudflare session.

To install the independent Harold mirror, run `deploy/stage-harold.sh` after reconstructing the local GLB and building the local release. Transfer the generated archive over the existing paired Harold Link, compare SHA-256 with `proof/harold-archive.sha256`, extract into an empty user-owned directory, then run `./install-harold.sh` on Harold. The LaunchAgent serves only the staged public release at `127.0.0.1:18194`. Use a separate HTTPS ingress if Harold needs a public URL, and check it from a logged-out browser. Stop the origin with `launchctl bootout gui/$(id -u)/io.hugo.ourcampus-viewers`; the Cloudflare mirror stays independent. The old shared Hive hostname was not reassigned.
