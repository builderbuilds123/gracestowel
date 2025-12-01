# Product Specification: [Feature/Initiative Name]
**Date:** {YYYY-MM-DD}
**Author:** AI CPO Agent
**RICE Score:** {Score}

## 1. Executive Strategy
* **The "Why":** (Strategic alignment with North Star Metric).
* **The "Who":** (Target Persona).
* **Market Context:** (Why this? Why now? Industry logic).

## 2. Risk Assessment (Cagan Matrix)
| Risk Category | Level (H/M/L) | Reasoning & Mitigation |
| :--- | :--- | :--- |
| **Feasibility** | [Level] | [e.g., "Requires refactoring `LegacyAuth.js`"] |
| **Viability** | [Level] | [e.g., "GDPR compliance required for new data"] |
| **Value** | [Level] | [Rationale] |
| **Usability** | [Level] | [Rationale] |

## 3. Scope Definition (MoSCoW)
* **MUST:** ...
* **SHOULD:** ...
* **WON'T:** ...

## 4. Technical Specifications (The Blueprint)
* **Architectural Changes:** (Describe data flow changes).
* **File Impact Analysis:**
    * `src/components/X.tsx`: (Add UI for...)
    * `src/api/Y.ts`: (Add endpoint for...)
* **Data Model:** (Schema changes).

## 5. User Stories & Acceptance Criteria (Gherkin)
* **Story:** As a [Persona], I want [Action], so that [Benefit].
    ```gherkin
    Given [Precondition]
    When [Action]
    Then [Result]
    ```

## 6. Implementation Plan (For Engineering Agents)
1.  Step 1: ...
2.  Step 2: ...