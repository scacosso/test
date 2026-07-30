import { Redis } from "ioredis";
import { candidateMatches, type QueueCandidate } from "@nexocam/shared";
import { Matchmaker, type Match } from "./matchmaker.js";

const CLAIM_SCRIPT = `
local left = ARGV[1]
local right = ARGV[2]
local leftLang = ARGV[3]
local leftExact = ARGV[4]
local rightLang = ARGV[5]
local rightExact = ARGV[6]
if redis.call('EXISTS', 'nexocam:active:' .. left) == 1 then return 0 end
if redis.call('EXISTS', 'nexocam:active:' .. right) == 1 then return 0 end
if redis.call('ZSCORE', leftLang, left) == false then return 0 end
if redis.call('ZSCORE', rightLang, right) == false then return 0 end
redis.call('ZREM', leftLang, left)
redis.call('ZREM', leftExact, left)
redis.call('ZREM', rightLang, right)
redis.call('ZREM', rightExact, right)
redis.call('SET', 'nexocam:active:' .. left, right, 'EX', 600)
redis.call('SET', 'nexocam:active:' .. right, left, 'EX', 600)
return 1
`;

export class RedisMatchmaker extends Matchmaker {
  private readonly redis: Redis;
  private localSize = 0;

  constructor(url: string, blocked: (a: string, b: string) => Promise<boolean>, sanctioned: (id: string) => Promise<boolean>) {
    super(blocked, sanctioned);
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
  }

  override get size() {
    return this.localSize;
  }

  private lang(language: string) {
    return `nexocam:queue:lang:${language}`;
  }

  private exact(language: string, country: string) {
    return `nexocam:queue:exact:${language}:${country}`;
  }

  override async join(candidate: QueueCandidate, now = Date.now()): Promise<Match | null> {
    if (await this.redis.exists(`nexocam:active:${candidate.userId}`) || await this.sanctioned(candidate.userId)) return null;
    const alreadyQueued = await this.redis.zscore(this.lang(candidate.language), candidate.userId);
    await this.redis
      .multi()
      .set(`nexocam:candidate:${candidate.userId}`, JSON.stringify(candidate), "EX", 120)
      .zadd(this.lang(candidate.language), candidate.joinedAt, candidate.userId)
      .zadd(this.exact(candidate.language, candidate.country), candidate.joinedAt, candidate.userId)
      .exec();
    if (alreadyQueued === null) this.localSize += 1;

    const key = this.lang(candidate.language);
    const ids = await this.redis.zrange(key, 0, 49);
    for (const id of ids) {
      if (id === candidate.userId) continue;
      const raw = await this.redis.get(`nexocam:candidate:${id}`);
      if (!raw) {
        await this.redis.zrem(key, id);
        continue;
      }
      const peer = JSON.parse(raw) as QueueCandidate;
      const blocked = await this.blocked(candidate.userId, peer.userId);
      if (!candidateMatches(candidate, peer, now, () => Boolean(blocked))) continue;
      const claimed = await this.redis.eval(
        CLAIM_SCRIPT,
        0,
        candidate.userId,
        peer.userId,
        this.lang(candidate.language),
        this.exact(candidate.language, candidate.country),
        this.lang(peer.language),
        this.exact(peer.language, peer.country)
      );
      if (claimed === 1) {
        this.localSize = Math.max(0, this.localSize - 2);
        return { left: candidate, right: peer };
      }
    }
    return null;
  }

  override async leave(userId: string) {
    const raw = await this.redis.get(`nexocam:candidate:${userId}`);
    if (!raw) return;
    const candidate = JSON.parse(raw) as QueueCandidate;
    await this.redis
      .multi()
      .zrem(this.lang(candidate.language), userId)
      .zrem(this.exact(candidate.language, candidate.country), userId)
      .del(`nexocam:candidate:${userId}`)
      .exec();
    this.localSize = Math.max(0, this.localSize - 1);
  }

  override async release(userId: string) {
    await this.redis.del(`nexocam:active:${userId}`);
  }
}
