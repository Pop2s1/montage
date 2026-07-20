import { describe, expect, it } from "vitest";
import { parseEditBrief, scoreTextAgainstBrief } from "@/lib/providers/montage/brief";

describe("parseEditBrief", () => {
  it("detects pace, duration and remove_silence intent", () => {
    const brief = parseEditBrief({
      prompt: "Monte un reel dynamique de 30s, coupe les silences, accroche forte",
      tone: "dynamique",
      targetDurationSec: 45,
    });
    expect(brief.preferredDurationSec).toBe(30);
    expect(brief.pace).toBe("fast");
    expect(brief.intents).toContain("remove_silence");
    expect(brief.wantHook).toBe(true);
  });

  it("scores transcript text against keywords", () => {
    const brief = parseEditBrief({
      prompt: "garde les moments festival et musique",
      tone: null,
      targetDurationSec: 40,
    });
    const high = scoreTextAgainstBrief("ce festival de musique était incroyable", brief);
    const low = scoreTextAgainstBrief("bonjour nous allons parler de cuisine", brief);
    expect(high).toBeGreaterThan(low);
  });
});
