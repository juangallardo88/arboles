"""Default case study: loss of medical oxygen supply to a hospital ICU.

The probabilities are illustrative values (probability of failure on demand
during one year of operation). Replace them with real maintenance records
from the hospital to obtain a real risk estimate.
"""

OXYGEN_SUPPLY_TREE = {
    "id": "G1",
    "label": "ICU loses medical oxygen supply",
    "kind": "OR",
    "description": "Top event: patients on ventilators stop receiving oxygen.",
    "children": [
        {
            "id": "G2",
            "label": "Central oxygen source fails",
            "kind": "AND",
            "description": "Both the main tank and the backup system fail at the same time.",
            "children": [
                {
                    "id": "G3",
                    "label": "Liquid oxygen tank (VIE) fails",
                    "kind": "OR",
                    "description": "Vacuum Insulated Evaporator, the main source.",
                    "children": [
                        {
                            "id": "E1",
                            "label": "Tank empty: supplier delivery delayed",
                            "kind": "BASIC",
                            "probability": 0.02,
                            "description": "Refill truck does not arrive before the reserve runs out.",
                        },
                        {
                            "id": "E2",
                            "label": "Vaporizer frozen by high demand",
                            "kind": "BASIC",
                            "probability": 0.01,
                            "description": "Ice blocks the ambient vaporizer during demand peaks.",
                        },
                        {
                            "id": "E3",
                            "label": "Main pressure regulator failure",
                            "kind": "BASIC",
                            "probability": 0.005,
                        },
                    ],
                },
                {
                    "id": "G4",
                    "label": "Backup cylinder manifold fails",
                    "kind": "OR",
                    "description": "High-pressure cylinder bank that should take over.",
                    "children": [
                        {
                            "id": "E4",
                            "label": "Backup cylinders empty or not replaced",
                            "kind": "BASIC",
                            "probability": 0.05,
                        },
                        {
                            "id": "G5",
                            "label": "Backup not activated in time",
                            "kind": "AND",
                            "children": [
                                {
                                    "id": "E5",
                                    "label": "Automatic changeover valve stuck",
                                    "kind": "BASIC",
                                    "probability": 0.01,
                                },
                                {
                                    "id": "E6",
                                    "label": "Staff not trained for manual changeover",
                                    "kind": "BASIC",
                                    "probability": 0.1,
                                },
                            ],
                        },
                        {
                            "id": "E7",
                            "label": "Manifold leak",
                            "kind": "BASIC",
                            "probability": 0.008,
                        },
                    ],
                },
            ],
        },
        {
            "id": "G6",
            "label": "Pipeline distribution to ICU fails",
            "kind": "OR",
            "description": "Copper pipes, zone valves and alarms between the source and the beds.",
            "children": [
                {
                    "id": "E8",
                    "label": "ICU zone valve closed by mistake",
                    "kind": "BASIC",
                    "probability": 0.003,
                },
                {
                    "id": "E9",
                    "label": "Pipeline rupture during construction work",
                    "kind": "BASIC",
                    "probability": 0.002,
                },
                {
                    "id": "G7",
                    "label": "Pressure drop not detected",
                    "kind": "AND",
                    "children": [
                        {
                            "id": "E10",
                            "label": "Slow leak in a pipe joint",
                            "kind": "BASIC",
                            "probability": 0.04,
                        },
                        {
                            "id": "E11",
                            "label": "Area alarm panel out of service",
                            "kind": "BASIC",
                            "probability": 0.02,
                        },
                    ],
                },
            ],
        },
        {
            "id": "E12",
            "label": "Oxygen contaminated at the source",
            "kind": "BASIC",
            "probability": 0.001,
            "description": "Wrong gas connected or contaminated batch (common-cause event).",
        },
    ],
}
