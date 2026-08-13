import { describe, expect, test, vi } from "vitest";
import {
    HistoricalDataService
} from "../HistoricalDataService.js";
import type {
    HistoricalDataFetcher
} from "../HistoricalDataService.js";

function createMarketDataService(): HistoricalDataFetcher {
    return {
        fetchAndStore: vi.fn().mockImplementation(
            async (request) => {
                const hours =
                    (request.end.getTime() - request.start.getTime()) /
                    (60 * 60 * 1000);

                const count = Math.max(1, Math.round(hours));

                return Array.from(
                    { length: count },
                    (_, index) => ({
                        symbol: request.symbol,
                        timeframe: request.timeframe,
                        timestamp: new Date(
                            request.start.getTime() +
                            index * 5 * 60 * 1000
                        ),
                        open: 500,
                        high: 502,
                        low: 499,
                        close: 501,
                        volume: 100_000
                    })
                );
            }
        ),
        getStoredCandles: vi.fn().mockResolvedValue([])
    };
}

describe("HistoricalDataService", () => {
    test("splits a range into seven-day chunks", async () => {
        const marketDataService =
            createMarketDataService();

        const service =
            new HistoricalDataService(
                marketDataService,
                {
                    chunkDays: 7
                }
            );

        const start =
            new Date("2026-01-01T00:00:00Z");

        const end =
            new Date("2026-01-20T00:00:00Z");

        const total =
            await service.fetchRange({
                symbol: "QQQ",
                timeframe: "5m",
                start,
                end
            });

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenCalledTimes(3);

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenNthCalledWith(
            1,
            {
                symbol: "QQQ",
                timeframe: "5m",
                start: new Date("2026-01-01T00:00:00Z"),
                end: new Date("2026-01-08T00:00:00Z")
            }
        );

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenNthCalledWith(
            2,
            {
                symbol: "QQQ",
                timeframe: "5m",
                start: new Date("2026-01-08T00:00:00Z"),
                end: new Date("2026-01-15T00:00:00Z")
            }
        );

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenNthCalledWith(
            3,
            {
                symbol: "QQQ",
                timeframe: "5m",
                start: new Date("2026-01-15T00:00:00Z"),
                end: new Date("2026-01-20T00:00:00Z")
            }
        );

        expect(total).toBe(456);
    });

    test("uses one request for a range smaller than one chunk", async () => {
        const marketDataService =
            createMarketDataService();

        const service =
            new HistoricalDataService(
                marketDataService,
                {
                    chunkDays: 7
                }
            );

        const start =
            new Date("2026-01-01T00:00:00Z");

        const end =
            new Date("2026-01-03T00:00:00Z");

        const total =
            await service.fetchRange({
                symbol: "QQQ",
                timeframe: "5m",
                start,
                end
            });

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenCalledTimes(1);

        expect(total).toBe(48);
    });

    test("does not create an extra chunk at an exact boundary", async () => {
        const marketDataService =
            createMarketDataService();

        const service =
            new HistoricalDataService(
                marketDataService,
                {
                    chunkDays: 7
                }
            );

        const start =
            new Date("2026-01-01T00:00:00Z");

        const end =
            new Date("2026-01-15T00:00:00Z");

        await service.fetchRange({
            symbol: "QQQ",
            timeframe: "5m",
            start,
            end
        });

        expect(
            marketDataService.fetchAndStore
        ).toHaveBeenCalledTimes(2);
    });

    test("rejects a zero chunk size", () => {
        const marketDataService =
            createMarketDataService();

        expect(
            () =>
                new HistoricalDataService(
                    marketDataService,
                    {
                        chunkDays: 0
                    }
                )
        ).toThrow(
            "chunkDays must be greater than zero."
        );
    });

    test("rejects a negative chunk size", () => {
        const marketDataService =
            createMarketDataService();

        expect(
            () =>
                new HistoricalDataService(
                    marketDataService,
                    {
                        chunkDays: -1
                    }
                )
        ).toThrow(
            "chunkDays must be greater than zero."
        );
    });

   test("does not fetch when the requested range is already stored", async () => {
    const marketDataService =
        createMarketDataService();

    const start =
        new Date("2026-01-01T00:00:00Z");

    const end =
        new Date("2026-01-03T00:00:00Z");

    const storedCandles = Array.from(
        { length: 576 },
        (_, index) => ({
            symbol: "QQQ",
            timeframe: "5m" as const,
            timestamp: new Date(
                start.getTime() +
                index * 5 * 60 * 1000
            ),
            open: 500,
            high: 502,
            low: 499,
            close: 501,
            volume: 100_000
        })
    );

    vi.mocked(
        marketDataService.getStoredCandles
    ).mockResolvedValue(storedCandles);

    const service =
        new HistoricalDataService(
            marketDataService,
            {
                chunkDays: 7
            }
        );

    await service.fetchRange({
        symbol: "QQQ",
        timeframe: "5m",
        start,
        end
    });

    expect(
        marketDataService.getStoredCandles
    ).toHaveBeenCalledOnce();

    expect(
        marketDataService.getStoredCandles
    ).toHaveBeenCalledWith({
        symbol: "QQQ",
        timeframe: "5m",
        start,
        end
    });

    expect(
        marketDataService.fetchAndStore
    ).not.toHaveBeenCalled();
});

test("fetches only the missing portion of a partially stored range", async () => {
    const marketDataService =
        createMarketDataService();

    const start =
        new Date("2026-01-01T00:00:00Z");

    const missingStart =
        new Date("2026-01-01T12:00:00Z");

    const end =
        new Date("2026-01-02T00:00:00Z");

    const storedCandles = Array.from(
        { length: 144 },
        (_, index) => ({
            symbol: "QQQ",
            timeframe: "5m" as const,
            timestamp: new Date(
                start.getTime() +
                index * 5 * 60 * 1000
            ),
            open: 500,
            high: 502,
            low: 499,
            close: 501,
            volume: 100_000
        })
    );

    vi.mocked(
        marketDataService.getStoredCandles
    ).mockResolvedValue(storedCandles);

    const service =
        new HistoricalDataService(
            marketDataService,
            {
                chunkDays: 7
            }
        );

    await service.fetchRange({
        symbol: "QQQ",
        timeframe: "5m",
        start,
        end
    });

    expect(
        marketDataService.fetchAndStore
    ).toHaveBeenCalledOnce();

    expect(
        marketDataService.fetchAndStore
    ).toHaveBeenCalledWith({
        symbol: "QQQ",
        timeframe: "5m",
        start: missingStart,
        end
    });
});

test("fetches only an internal gap in stored data", async () => {
    const marketDataService =
        createMarketDataService();

    const start =
        new Date("2026-01-01T00:00:00Z");

    const gapStart =
        new Date("2026-01-01T12:00:00Z");

    const gapEnd =
        new Date("2026-01-01T13:00:00Z");

    const end =
        new Date("2026-01-02T00:00:00Z");

    const storedCandles = [];

    for (
        let timestamp = start.getTime();
        timestamp < end.getTime();
        timestamp += 5 * 60 * 1000
    ) {
        if (
            timestamp >= gapStart.getTime() &&
            timestamp < gapEnd.getTime()
        ) {
            continue;
        }

        storedCandles.push({
            symbol: "QQQ",
            timeframe: "5m" as const,
            timestamp: new Date(timestamp),
            open: 500,
            high: 502,
            low: 499,
            close: 501,
            volume: 100_000
        });
    }

    vi.mocked(
        marketDataService.getStoredCandles
    ).mockResolvedValue(storedCandles);

    const service =
        new HistoricalDataService(
            marketDataService,
            {
                chunkDays: 7
            }
        );

    await service.fetchRange({
        symbol: "QQQ",
        timeframe: "5m",
        start,
        end
    });

    expect(
        marketDataService.fetchAndStore
    ).toHaveBeenCalledOnce();

    expect(
        marketDataService.fetchAndStore
    ).toHaveBeenCalledWith({
        symbol: "QQQ",
        timeframe: "5m",
        start: gapStart,
        end: gapEnd
    });
});
});