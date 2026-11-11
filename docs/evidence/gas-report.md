# Truffle Gas Report

Generated with `eth-gas-reporter` using solc 0.8.19, optimizer enabled with 200 runs, and the development network's 6,718,946-gas block limit.

Run on Windows PowerShell:

```powershell
$env:REPORT_GAS = 'true'
npx truffle test --config truffle-config.js
```

The table aggregates successful transaction calls observed in the Truffle tests. Reverted transactions and view/pure calls are not included. `Avg` is the reporter's arithmetic mean; min and max are shown as `—` when only one call was observed.

| Contract | Function | Min gas | Average gas | Max gas | Calls |
|---|---|---:|---:|---:|---:|
| ProductContract | registerProduct | 267,537 | 285,227 | 301,773 | 58 |
| ProductContract | setTrackingContract | 45,286 | 45,298 | 45,298 | 31 |
| ReputationContract | applyPenalty | — | 233,150 | — | 1 |
| ReputationContract | finalizeScore | 247,436 | 292,678 | 347,758 | 38 |
| ReputationContract | recordInspection | 118,912 | 118,950 | 118,960 | 30 |
| ReputationContract | setAlpha | 221,972 | 261,772 | 301,572 | 2 |
| ReputationContract | setSuspended | 29,376 | 40,332 | 51,288 | 2 |
| ReputationContract | setThresholds | — | 310,551 | — | 3 |
| ReputationContract | setWeights | 218,541 | 265,189 | 311,837 | 2 |
| ReputationContract | submitFeedback | 118,118 | 118,121 | 118,142 | 30 |
| RoleRegistry | grantRole | 49,159 | 49,176 | 49,192 | 130 |
| RoleRegistry | revokeRole | 27,273 | 27,284 | 27,295 | 6 |
| TrackingContract | confirmBuyer | — | 61,342 | — | 33 |
| TrackingContract | handover | 58,372 | 59,867 | 68,420 | 52 |
| TrackingContract | handoverWithCare | 299,417 | 313,420 | 339,217 | 42 |
| TrackingContract | recall | 81,843 | 81,875 | 81,927 | 8 |
| TrackingContract | recordBuyer | — | 65,877 | — | 33 |
| TrackingContract | setReputation | — | 50,878 | — | 3 |
| TrackingContract | updateShipment | 215,498 | 255,210 | 400,954 | 201 |

## Summary

`handoverWithCare` has the highest average gas among the measured functions (313,420), reflecting its validation and storage of a multi-field care attestation. `finalizeScore` averages 292,678 gas as it computes and stores accumulated scores and history. `updateShipment` has the most calls (201) and a wider range because lifecycle transitions write different state. These figures are local development-chain measurements, not a production-chain fee estimate.
