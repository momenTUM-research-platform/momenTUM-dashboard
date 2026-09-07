"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  SleepRow,
} from "@/lib/types";

import {
  clockMinutes,
  formatDuration,
  median,
  participantColor,
} from "../../lib/vizUtils";

import styles from "./SleepVizPanel.module.css";

export default function SleepRibbon({
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
  const ref =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    width,
    setWidth,
  ] =
    useState(900);

  useEffect(() => {
    const element =
      ref.current;

    if (!element) {
      return;
    }

    const observer =
      new ResizeObserver(
        () =>
          setWidth(
            Math.max(
              700,
              element.clientWidth -
                24,
            ),
          ),
      );

    observer.observe(
      element,
    );

    return () =>
      observer.disconnect();
  }, []);

  const groups =
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

  const leftLabelWidth =
    120;

  const axisWidth =
    Math.max(
      680,
      width,
    );

  const plotWidth =
    Math.max(
      480,
      axisWidth -
      leftLabelWidth -
      20,
    );

  const rowHeight =
    24;

  const gap =
    7;

  const startMinutes =
    20 * 60;

  const endMinutes =
    38 * 60;

  const minutesSpan =
    endMinutes -
    startMinutes;

  const xForMinutes =
    (minutes: number) =>
      (
        (
          minutes -
          startMinutes
        ) /
        minutesSpan
      ) *
      plotWidth;

  const segmentFor =
    (
      start: Date,
      end: Date,
    ) => {
      const normalizedStart =
        clockMinutes(
          start,
        );

      let normalizedEnd =
        clockMinutes(
          end,
        );

      if (
        normalizedEnd <
        normalizedStart
      ) {
        normalizedEnd +=
          1440;
      }

      const segmentStart =
        Math.max(
          startMinutes,
          normalizedStart,
        );

      const segmentEnd =
        Math.min(
          endMinutes,
          normalizedEnd,
        );

      if (
        segmentEnd <=
        segmentStart
      ) {
        return [];
      }

      return [
        {
          start:
            segmentStart,

          end:
            segmentEnd,
        },
      ];
    };

  const ticks = [
    {
      value:
        20 * 60,
      label:
        "20:00",
    },
    {
      value:
        23 * 60,
      label:
        "23:00",
    },
    {
      value:
        26 * 60,
      label:
        "02:00",
    },
    {
      value:
        29 * 60,
      label:
        "05:00",
    },
    {
      value:
        32 * 60,
      label:
        "08:00",
    },
    {
      value:
        35 * 60,
      label:
        "11:00",
    },
    {
      value:
        38 * 60,
      label:
        "14:00",
    },
  ];

  return (
    <div
      ref={ref}
      className={
        styles.ribbonWrap
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
            Sleep timing
          </h5>

          <p
            className={
              styles.chartDescription
            }
          >
            Reported sleep window
            and derived sleeping
            period for each diary
            day.
          </p>
        </div>
      </div>

      {groups.map(
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

          const color =
            participantColor(
              displayId,
            );

          const starts =
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

          const ends =
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

          const medianStart =
            median(
              starts,
            );

          const medianEnd =
            median(
              ends,
            );

          const svgHeight =
            rows.length *
              (
                rowHeight +
                gap
              ) +
            8;

          const svgWidth =
            leftLabelWidth +
            plotWidth +
            20;

          return (
            <div
              key={
                userId
              }
              className={
                styles.userBlock
              }
            >
              <div
                className={
                  styles.userHeader
                }
              >
                <span
                  className={
                    styles.userMarker
                  }
                  style={{
                    backgroundColor:
                      color,
                  }}
                  aria-hidden="true"
                />

                <div>
                  <div
                    className={
                      styles.userName
                    }
                  >
                    {
                      displayId
                    }
                  </div>

                  {showRaw && (
                    <div
                      className={
                        styles.userRaw
                      }
                    >
                      {
                        userId
                      }
                    </div>
                  )}
                </div>
              </div>

              <div
                className={
                  styles.sleepChart
                }
              >
                <div
                  className={
                    styles.sleepAxis
                  }
                >
                  <div
                    style={{
                      width:
                        leftLabelWidth,
                    }}
                  />

                  <div
                    className={
                      styles.sleepAxisPlot
                    }
                    style={{
                      width:
                        plotWidth,
                    }}
                  >
                    {ticks.map(
                      (tick) => (
                        <span
                          key={
                            tick.value
                          }
                          className={
                            styles.sleepAxisTick
                          }
                          style={{
                            left:
                              xForMinutes(
                                tick.value,
                              ),
                          }}
                        >
                          {
                            tick.label
                          }
                        </span>
                      ),
                    )}
                  </div>
                </div>

                <div
                  className={
                    styles.sleepLegend
                  }
                >
                  <span>
                    <i
                      className={
                        styles.windowLegend
                      }
                    />
                    Try to sleep →
                    out of bed
                  </span>

                  <span>
                    <i
                      className={
                        styles.sleepLegendFill
                      }
                    />
                    Derived sleep
                  </span>

                  <span>
                    <i
                      className={
                        styles.onsetLegend
                      }
                    />
                    Sleep onset
                  </span>

                  <span>
                    <i
                      className={
                        styles.medianLegend
                      }
                    />
                    Participant
                    median
                  </span>
                </div>

                <svg
                  width={
                    svgWidth
                  }
                  height={
                    svgHeight
                  }
                >
                  {ticks.map(
                    (tick) => (
                      <line
                        key={
                          tick.value
                        }
                        x1={
                          leftLabelWidth +
                          xForMinutes(
                            tick.value,
                          )
                        }
                        x2={
                          leftLabelWidth +
                          xForMinutes(
                            tick.value,
                          )
                        }
                        y1="0"
                        y2={
                          svgHeight
                        }
                        className={
                          styles.gridLine
                        }
                      />
                    ),
                  )}

                  {medianStart !==
                    null && (
                    <line
                      x1={
                        leftLabelWidth +
                        xForMinutes(
                          medianStart,
                        )
                      }
                      x2={
                        leftLabelWidth +
                        xForMinutes(
                          medianStart,
                        )
                      }
                      y1="0"
                      y2={
                        svgHeight
                      }
                      className={
                        styles.medianLine
                      }
                    />
                  )}

                  {medianEnd !==
                    null && (
                    <line
                      x1={
                        leftLabelWidth +
                        xForMinutes(
                          medianEnd,
                        )
                      }
                      x2={
                        leftLabelWidth +
                        xForMinutes(
                          medianEnd,
                        )
                      }
                      y1="0"
                      y2={
                        svgHeight
                      }
                      className={
                        styles.medianLine
                      }
                    />
                  )}

                  {rows.map(
                    (
                      row,
                      index,
                    ) => {
                      const y =
                        index *
                          (
                            rowHeight +
                            gap
                          ) +
                        5;

                      const end =
                        row.finalAwakeningTime ??
                        row.outOfBedTime;

                      const windowSegments =
                        row.trySleepTime &&
                        row.outOfBedTime
                          ? segmentFor(
                              row.trySleepTime,
                              row.outOfBedTime,
                            )
                          : [];

                      const sleepSegments =
                        row.sleepOnsetTime &&
                        end
                          ? segmentFor(
                              row.sleepOnsetTime,
                              end,
                            )
                          : [];

                      return (
                        <g
                          key={`${row.date}-${index}`}
                        >
                          <text
                            x="8"
                            y={
                              y +
                              15
                            }
                            className={
                              styles.sleepDate
                            }
                          >
                            {
                              row.date
                            }
                          </text>

                          {windowSegments.map(
                            (
                              segment,
                              segmentIndex,
                            ) => (
                              <rect
                                key={`window-${segmentIndex}`}
                                x={
                                  leftLabelWidth +
                                  xForMinutes(
                                    segment.start,
                                  )
                                }
                                y={
                                  y +
                                  2
                                }
                                width={
                                  Math.max(
                                    3,
                                    xForMinutes(
                                      segment.end,
                                    ) -
                                    xForMinutes(
                                      segment.start,
                                    ),
                                  )
                                }
                                height={
                                  rowHeight -
                                  4
                                }
                                rx="3"
                                className={
                                  styles.sleepWindowRect
                                }
                              />
                            ),
                          )}

                          {sleepSegments.map(
                            (
                              segment,
                              segmentIndex,
                            ) => (
                              <rect
                                key={`sleep-${segmentIndex}`}
                                x={
                                  leftLabelWidth +
                                  xForMinutes(
                                    segment.start,
                                  )
                                }
                                y={
                                  y +
                                  6
                                }
                                width={
                                  Math.max(
                                    3,
                                    xForMinutes(
                                      segment.end,
                                    ) -
                                    xForMinutes(
                                      segment.start,
                                    ),
                                  )
                                }
                                height={
                                  rowHeight -
                                  12
                                }
                                rx="3"
                                fill={
                                  color
                                }
                                opacity="0.72"
                              >
                                <title>
                                  {row.sleepDurationMin !==
                                  null
                                    ? `Sleep ${formatDuration(
                                        row.sleepDurationMin,
                                      )}`
                                    : "Sleep duration unavailable"}
                                </title>
                              </rect>
                            ),
                          )}

                          {row.sleepOnsetTime && (
                            <circle
                              cx={
                                leftLabelWidth +
                                xForMinutes(
                                  clockMinutes(
                                    row.sleepOnsetTime,
                                  ),
                                )
                              }
                              cy={
                                y +
                                rowHeight /
                                  2
                              }
                              r="3"
                              className={
                                styles.onsetPoint
                              }
                            />
                          )}
                        </g>
                      );
                    },
                  )}
                </svg>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}