import type { ThematicMapMetadata } from "./types";

export interface PlannedThematicLayer {
  id: string;
  metadata: ThematicMapMetadata;
}

export const plannedThematicLayers: PlannedThematicLayer[] = [
  {
    id: "accessibility",
    metadata: {
      title: "Accessibility",
      description: "Future accessibility map for metro, stops, schools, healthcare and services.",
      keywords: ["accessibility", "transport", "schools", "healthcare"],
      supports3D: true,
      supportsPSD: true,
    },
  },
  {
    id: "visibility",
    metadata: {
      title: "Visibility",
      description: "Future visibility and view corridor analysis.",
      keywords: ["visibility", "views", "corridors"],
      supports3D: true,
      supportsPSD: false,
    },
  },
  {
    id: "solar",
    metadata: {
      title: "Solar",
      description: "Future solar exposure and insolation analysis.",
      keywords: ["solar", "insolation", "sun"],
      supports3D: true,
      supportsPSD: true,
    },
  },
  {
    id: "noise",
    metadata: {
      title: "Noise",
      description: "Future environmental noise analysis.",
      keywords: ["noise", "environment", "roads"],
      supports3D: false,
      supportsPSD: true,
    },
  },
  {
    id: "wind",
    metadata: {
      title: "Wind",
      description: "Future wind comfort and exposure analysis.",
      keywords: ["wind", "comfort", "microclimate"],
      supports3D: true,
      supportsPSD: true,
    },
  },
  {
    id: "morphology",
    metadata: {
      title: "Morphology",
      description: "Future urban morphology and fabric analysis.",
      keywords: ["morphology", "urban fabric", "density"],
      supports3D: true,
      supportsPSD: true,
    },
  },
  {
    id: "network-analysis",
    metadata: {
      title: "Network Analysis",
      description: "Future graph and network analysis.",
      keywords: ["network", "graph", "routes"],
      supports3D: false,
      supportsPSD: false,
    },
  },
];
