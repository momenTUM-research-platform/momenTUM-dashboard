"use client";

import {
  useMemo,
} from "react";

import {
  SleepRow,
} from "../../lib/types"

import {
  average,
  clockMinutes,
  formatClockMinutes,
  formatDuration,
  median,
} from "../../lib/vizUtils"

import styles from "./SleepVizPanel.module.css";

export default function SleepStats({
  data,
  mapping,
}: {
  data:
    SleepRow[];

  mapping?: Record<
    string,
    string
  >;

  mappingName?: string;
}) {
  const byUser =
    useMemo(() => {
      const map =
        new Map<
          string,
          SleepRow[]
        >();

      for (
        const row
        of data
      ) {
        if (
          !map.has(
            row.user_id,
          )
        ) {
          map.set(
            row.user_id,
            [],
          );
        }

        map
          .get(
            row.user_id,
          )!
          .push(
            row,
          );
      }

      for (
        const rows
        of map.values()
      ) {
        rows.sort(
          (
            a,
            b,
          ) =>
            a.date.localeCompare(
              b.date,
            ),
        );
      }

      return Array.from(
        map.entries(),
      );
    }, [
      data,
    ]);

  return (
    <div
      className={
        styles.statsSection
      }
    >
      <div
        className={
          styles.sectionHeadingRow
        }
      >
        <div>
          <h5
            className={
              styles.chartTitle
            }
          >
            Participant summaries
          </h5>

          <p
            className={
              styles.chartDescription
            }
          >
            Descriptive summaries
            derived from available
            diary responses.
          </p>
        </div>
      </div>

      <div
        className={
          styles.statsGrid
        }
      >
        {byUser.map(
          ([
            userId,
            rows,
          ]) => {
            const displayId =
              mapping?.[
                userId
              ] ??
              userId;

            const showRaw =
              displayId !==
              userId;

            const tryTimes =
              rows
                .map(
                  (row) =>
                    row.trySleepTime
                      ? clockMinutes(
                          row.trySleepTime,
                        )
                      : null,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const onsetTimes =
              rows
                .map(
                  (row) =>
                    row.sleepOnsetTime
                      ? clockMinutes(
                          row.sleepOnsetTime,
                        )
                      : null,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const endTimes =
              rows
                .map(
                  (row) => {
                    const end =
                      row.finalAwakeningTime ??
                      row.outOfBedTime;

                    return end
                      ? clockMinutes(
                          end,
                        )
                      : null;
                  },
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const sleepDurations =
              rows
                .map(
                  (row) =>
                    row.sleepDurationMin,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const sleepIncludingNaps =
              rows
                .map(
                  (row) =>
                    row.sleepDurationInclNapsMin,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const latency =
              rows
                .map(
                  (row) =>
                    row.sleepLatencyMin,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const awakeMinutes =
              rows
                .map(
                  (row) =>
                    row.awakeningsDurationMin,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const napMinutes =
              rows
                .map(
                  (row) =>
                    row.napMinutes,
                )
                .filter(
                  (
                    value,
                  ): value is number =>
                    value !==
                    null,
                );

            const avgSleep =
              average(
                sleepDurations,
              );

            const avgSleepInclNaps =
              average(
                sleepIncludingNaps,
              );

            const avgLatency =
              average(
                latency,
              );

            const avgAwake =
              average(
                awakeMinutes,
              );

            const avgNap =
              average(
                napMinutes,
              );

            return (
              <div
                key={
                  userId
                }
                className={
                  styles.statBlock
                }
              >
                <div
                  className={
                    styles.statHeader
                  }
                >
                  <strong
                    className={
                      styles.statParticipant
                    }
                  >
                    {
                      displayId
                    }
                  </strong>

                  {showRaw && (
                    <span
                      className={
                        styles.statRaw
                      }
                    >
                      {
                        userId
                      }
                    </span>
                  )}
                </div>

                <dl
                  className={
                    styles.statList
                  }
                >
                  <div>
                    <dt>
                      Diary days
                    </dt>

                    <dd>
                      {
                        rows.length
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Avg sleep
                    </dt>

                    <dd>
                      {avgSleep !==
                      null
                        ? formatDuration(
                            avgSleep,
                          )
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Avg sleep incl.
                      naps
                    </dt>

                    <dd>
                      {avgSleepInclNaps !==
                      null
                        ? formatDuration(
                            avgSleepInclNaps,
                          )
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Median try to
                      sleep
                    </dt>

                    <dd>
                      {formatClockMinutes(
                        median(
                          tryTimes,
                        ),
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Median sleep
                      onset
                    </dt>

                    <dd>
                      {formatClockMinutes(
                        median(
                          onsetTimes,
                        ),
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Median end
                    </dt>

                    <dd>
                      {formatClockMinutes(
                        median(
                          endTimes,
                        ),
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Avg latency
                    </dt>

                    <dd>
                      {avgLatency !==
                      null
                        ? `${Math.round(
                            avgLatency,
                          )} min`
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Avg awake
                      minutes
                    </dt>

                    <dd>
                      {avgAwake !==
                      null
                        ? `${Math.round(
                            avgAwake,
                          )} min`
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Avg nap
                      minutes
                    </dt>

                    <dd>
                      {avgNap !==
                      null
                        ? `${Math.round(
                            avgNap,
                          )} min`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}