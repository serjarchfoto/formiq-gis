import type { FormiqProjectData } from "@/types/formiq";
import { AnalysisEngine } from "@/lib/gis-engine/analysis";
import { BooleanOperationsService } from "./BooleanOperationsService";
import { CentroidService } from "./CentroidService";
import { ClipService } from "./ClipService";
import { ConvexHullService } from "./ConvexHullService";
import { MeasurementService } from "./MeasurementService";
import { NearestPointService } from "./NearestPointService";
import { OverlayOperationsService } from "./OverlayOperationsService";
import { SimplifyService } from "./SimplifyService";
import { VoronoiService } from "./VoronoiService";

export class GISOperationsEngine {
  readonly measurement = new MeasurementService();
  readonly centroid = new CentroidService();
  readonly simplify = new SimplifyService();
  readonly convexHull = new ConvexHullService();
  readonly nearestPoint = new NearestPointService();
  readonly clip = new ClipService();
  readonly boolean = new BooleanOperationsService();
  readonly overlay = new OverlayOperationsService();
  readonly voronoi = new VoronoiService();

  constructor(private readonly analysisEngine = new AnalysisEngine()) {}

  analyze(project: FormiqProjectData) {
    return this.analysisEngine.analyze(project);
  }
}
