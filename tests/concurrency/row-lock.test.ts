import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Sql, startPostgres } from '../support/postgres';

/**
 * Bài kiểm chứng NỀN cho hard quota ở P5 (phase-1 mục 8, 14; DEC-T05, DEC-T09).
 *
 * Toàn bộ hard quota đứng trên một giả định: `SELECT ... FOR UPDATE` trong một transaction
 * thật sự serialize hai người tiêu đồng thời. Giả định đó KHÔNG thể kiểm bằng mock hay
 * in-memory DB — nó là hành vi của engine PostgreSQL. Nếu giả định sai, phát hiện ở P5 sẽ
 * tốn hơn nhiều lần.
 *
 * Suite này chạy PostgreSQL thật qua testcontainers, nối TRỰC TIẾP (không qua Supavisor).
 * Nó chứng minh semantics của engine. Việc Supavisor giữ nguyên semantics đó qua pooler là
 * câu hỏi riêng, đã có evidence ở spike P1.5.
 */
describe('row lock — SELECT ... FOR UPDATE', () => {
  let container: StartedPostgreSqlContainer;
  /** Ba connection RỜI NHAU: hai người tranh chấp + một quan sát viên. */
  let alice: Sql;
  let bob: Sql;
  let observer: Sql;

  beforeAll(async () => {
    container = await startPostgres();
    alice = connect(container, 1);
    bob = connect(container, 1);
    observer = connect(container, 1);

    await observer.unsafe(`
      CREATE TABLE lock_probe (
        id      int PRIMARY KEY,
        balance int NOT NULL
      )
    `);
  }, 180_000);

  afterAll(async () => {
    await Promise.all([
      alice?.end({ timeout: 5 }),
      bob?.end({ timeout: 5 }),
      observer?.end({ timeout: 5 }),
    ]);
    await container?.stop();
  }, 60_000);

  beforeEach(async () => {
    await observer.unsafe('TRUNCATE lock_probe');
    await observer.unsafe('INSERT INTO lock_probe (id, balance) VALUES (1, 1), (2, 1)');
  });

  /**
   * Hỏi chính PostgreSQL xem `pid` có đang bị chặn không. Đây là bằng chứng trực tiếp,
   * khác hẳn việc suy ra từ đồng hồ: một cái sleep dài cũng làm test "chậm" mà không hề
   * có lock nào. `pg_blocking_pids` chỉ trả về pid khi engine thật sự bắt chờ lock.
   */
  async function blockersOf(pid: number): Promise<number[]> {
    const rows = await observer<{ blockers: number[] }[]>`
      SELECT pg_blocking_pids(${pid}) AS blockers
    `;
    return rows[0]?.blockers ?? [];
  }

  async function waitUntilBlocked(pid: number, by: number, timeoutMs = 5_000): Promise<number[]> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const blockers = await blockersOf(pid);
      if (blockers.includes(by)) return blockers;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`pid ${pid} không bị chặn bởi ${by} trong ${timeoutMs}ms`);
  }

  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('hai transaction FOR UPDATE cùng một row phải SERIALIZE — PostgreSQL tự khai báo bị chặn', async () => {
    const aHolds = deferred();
    const aMayCommit = deferred();

    let alicePid = 0;
    let bobPid = 0;
    let bobAcquired = false;

    const aliceTx = alice.begin(async (tx) => {
      alicePid = Number((await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid);
      await tx.unsafe('SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE');
      aHolds.resolve();
      await aMayCommit.promise;
    });

    await aHolds.promise;

    const bobTx = bob.begin(async (tx) => {
      bobPid = Number((await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid);
      await tx.unsafe('SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE');
      bobAcquired = true;
    });

    // Chờ tới khi ENGINE xác nhận Bob bị Alice chặn. Đây là bằng chứng serialize —
    // chính PostgreSQL khai báo pid của Bob đang bị pid của Alice giữ.
    const blockers = await waitUntilBlocked(await pidOf(bob, () => bobPid), alicePid);
    expect(blockers).toContain(alicePid);

    // Trong khi Alice còn giữ lock, Bob KHÔNG đi tiếp được.
    expect(bobAcquired).toBe(false);

    aMayCommit.resolve();
    await aliceTx;
    await bobTx;

    // Bob chỉ đi tiếp sau khi Alice nhả lock.
    expect(bobAcquired).toBe(true);

    // CỐ Ý không so sánh timestamp giữa hai connection: Bob được cấp lock ngay khi COMMIT
    // của Alice được xử lý PHÍA SERVER, tức có thể sớm hơn lúc promise của Alice resolve
    // phía client. So sánh đồng hồ client ở đây từng cho kết quả lệch ~0.7ms và flaky.
    // `pg_blocking_pids` + cờ `bobAcquired` đã chứng minh đúng điều cần chứng minh.
  }, 60_000);

  it('KIỂM CHỨNG NGƯỢC — FOR UPDATE trên hai row KHÁC nhau thì KHÔNG chặn nhau', async () => {
    // Không có case này thì test trên vô nghĩa: một cái lock cấp-BẢNG, hay một transaction
    // chỉ đơn giản là chậm, cũng làm test trên pass. Case này chốt rằng cái chặn là
    // lock cấp-ROW, đúng thứ P5 cần.
    const aHolds = deferred();
    const aMayCommit = deferred();

    const aliceTx = alice.begin(async (tx) => {
      await tx.unsafe('SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE');
      aHolds.resolve();
      await aMayCommit.promise;
    });

    await aHolds.promise;

    // Bob khoá row 2 trong khi Alice giữ row 1. Phải xong ngay, không chờ Alice.
    const bobResult = await bob.begin(async (tx) => {
      const rows = await tx<{ balance: number }[]>`
        SELECT balance FROM lock_probe WHERE id = 2 FOR UPDATE
      `;
      return rows[0]?.balance;
    });

    expect(bobResult).toBe(1);

    aMayCommit.resolve();
    await aliceTx;
  }, 60_000);

  it('NOWAIT thất bại ngay khi row đang bị khoá — chứng minh lock là thật, không phải chờ ngẫu nhiên', async () => {
    const aHolds = deferred();
    const aMayCommit = deferred();

    const aliceTx = alice.begin(async (tx) => {
      await tx.unsafe('SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE');
      aHolds.resolve();
      await aMayCommit.promise;
    });

    await aHolds.promise;

    await expect(
      bob.begin((tx) => tx.unsafe('SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE NOWAIT')),
    ).rejects.toThrow(/could not obtain lock/i);

    aMayCommit.resolve();
    await aliceTx;
  }, 60_000);

  it('KHÔNG double-spend: hai transaction đồng thời tiêu 1 đơn vị từ balance 1 — đúng MỘT cái thắng', async () => {
    // Đây chính là kịch bản hard quota của P5, thu nhỏ. Nếu case này fail thì P5 không
    // được build — không phải "sửa test", mà là giả định nền sai.
    async function spend(sql: Sql): Promise<'granted' | 'denied'> {
      return sql.begin(async (tx) => {
        const rows = await tx<{ balance: number }[]>`
          SELECT balance FROM lock_probe WHERE id = 1 FOR UPDATE
        `;
        const balance = rows[0]?.balance ?? 0;

        if (balance < 1) return 'denied';

        await tx.unsafe('UPDATE lock_probe SET balance = balance - 1 WHERE id = 1');
        return 'granted';
      }) as Promise<'granted' | 'denied'>;
    }

    const outcomes = await Promise.all([spend(alice), spend(bob)]);

    expect(outcomes.filter((o) => o === 'granted')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'denied')).toHaveLength(1);

    const final = await observer<{ balance: number }[]>`
      SELECT balance FROM lock_probe WHERE id = 1
    `;
    // Không bao giờ âm. Balance âm nghĩa là đã double-spend.
    expect(final[0]?.balance).toBe(0);
  }, 60_000);

  it('isolation level mặc định là read committed — mức mà thiết kế quota giả định', async () => {
    // `SHOW transaction_isolation` trả về cột tên `transaction_isolation`; dùng
    // current_setting để đặt alias rõ ràng.
    const rows = await alice<{ level: string }[]>`
      SELECT current_setting('transaction_isolation') AS level
    `;
    expect(rows[0]?.level).toBe('read committed');
  }, 30_000);
});

/** Chờ pid được gán từ trong transaction đang chạy song song. */
async function pidOf(_sql: Sql, read: () => number, timeoutMs = 5_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pid = read();
    if (pid > 0) return pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('không lấy được backend pid trong thời gian chờ');
}
