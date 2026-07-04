export type SemanticMaskType =
  | "buildings"
  | "roads"
  | "vegetation"
  | "water"
  | "terrain";

export class MaskService {
  async exportSemanticMasks(_types: SemanticMaskType[]): Promise<never> {
    void _types;
    throw new Error("PSD semantic mask export is not implemented yet.");
  }
}
