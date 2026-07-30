import { candidateMatches, matchingStage, type QueueCandidate } from "@nexocam/shared";

export type Match = { left: QueueCandidate; right: QueueCandidate };
type BlockCheck = (left: string, right: string) => boolean | Promise<boolean>;
type SanctionCheck = (userId: string) => boolean | Promise<boolean>;

export class Matchmaker {
  private queue = new Map<string, QueueCandidate>();
  private activeUsers = new Set<string>();

  constructor(
    protected readonly blocked: BlockCheck = () => false,
    protected readonly sanctioned: SanctionCheck = () => false
  ) {}

  get size() {
    return this.queue.size;
  }

  get stageCounts() {
    const now = Date.now();
    return [...this.queue.values()].reduce<Record<string, number>>((counts, candidate) => {
      const stage = matchingStage(candidate.joinedAt, now);
      counts[stage] = (counts[stage] ?? 0) + 1;
      return counts;
    }, {});
  }

  leave(userId: string) {
    this.queue.delete(userId);
  }

  release(userId: string) {
    this.activeUsers.delete(userId);
  }

  async join(candidate: QueueCandidate, now = Date.now()): Promise<Match | null> {
    if (this.activeUsers.has(candidate.userId) || await this.sanctioned(candidate.userId)) return null;
    this.queue.set(candidate.userId, candidate);
    for (const peer of this.queue.values()) {
      if (peer.userId === candidate.userId || this.activeUsers.has(peer.userId)) continue;
      const blocked = await this.blocked(candidate.userId, peer.userId);
      if (!candidateMatches(candidate, peer, now, () => blocked)) continue;
      this.queue.delete(candidate.userId);
      this.queue.delete(peer.userId);
      this.activeUsers.add(candidate.userId);
      this.activeUsers.add(peer.userId);
      return { left: candidate, right: peer };
    }
    return null;
  }
}
