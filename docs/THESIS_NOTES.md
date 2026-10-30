# Thesis limitations and future work

The distributor-to-retailer storage-care checklist and explanation are
self-declared attestations. Blockchain storage makes the submitted statement
tamper-evident, but cannot establish that the distributor actually maintained
temperature, packaging, hygiene, or product condition. The chain verifies only
the storage interval, calculated from the on-chain `Delivered` timestamp to
the distributor-to-retailer handover timestamp. Future work could add
authenticated sensor/IoT readings, inspector spot checks, or retailer
acknowledgment at receipt. Reputation scoring does not currently incorporate
failed checklist items.

TABASC's current trust score remains dependent on its configured rules and
recorded batch history. One finalized batch can establish a trust label; a
minimum evidence threshold and a feedback-finalization window remain policy
decisions for the project owner.
