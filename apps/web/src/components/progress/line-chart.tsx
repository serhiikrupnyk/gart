'use client';

import { useId, useState } from 'react';

import { formatShortDate } from '@/lib/workout-format';

export interface ChartPoint {
  date: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 24, left: 12 };

/** Ukrainian decimal comma, at the precision measurements are taken. */
function formatValue(value: number): string {
  return (Math.round(value * 100) / 100).toString().replace('.', ',');
}

function positions(points: ChartPoint[]): { x: number; y: number }[] {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; drawing it down the middle is honest.
  const span = max - min || 1;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  return points.map((point, index) => ({
    x:
      PADDING.left +
      (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
    y:
      PADDING.top +
      (max === min ? innerHeight / 2 : innerHeight - ((point.value - min) / span) * innerHeight),
  }));
}

/**
 * A line chart in plain SVG — no charting dependency, which keeps the bundle
 * where it should be for a phone-first PWA and, more importantly, keeps the
 * accessible representation ours to get right.
 *
 * Nothing here depends on colour: the shape is described in words by the
 * figure's own label, every point is a marker, and the exact numbers live in a
 * real table one button away — which trainers want anyway.
 */
export function LineChart({
  title,
  unit,
  points,
  emptyLabel = 'Ще немає замірів',
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
  emptyLabel?: string;
}) {
  const tableId = useId();
  const [showTable, setShowTable] = useState(false);

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-text-secondary">{emptyLabel}</p>;
  }

  const coordinates = positions(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last.value - first.value;

  const summary =
    points.length === 1
      ? `${title}: один замір ${formatShortDate(first.date)} — ${formatValue(first.value)} ${unit}.`
      : `${title}: ${String(points.length)} замірів з ${formatShortDate(first.date)} до ${formatShortDate(last.date)}, ` +
        `від ${formatValue(first.value)} до ${formatValue(last.value)} ${unit} ` +
        `(${change > 0 ? '+' : ''}${formatValue(change)} ${unit}).`;

  return (
    <figure className="mt-2">
      {/* The chart itself is one image to assistive technology, described by a
          sentence that states the trend — a list of coordinates would not. */}
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="w-full"
      >
        <polyline
          points={coordinates.map((point) => `${String(point.x)},${String(point.y)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-accent"
        />
        {coordinates.map((point, index) => (
          <circle
            key={points[index]?.date}
            cx={point.x}
            cy={point.y}
            r={index === coordinates.length - 1 ? 5 : 3.5}
            className="fill-accent"
          />
        ))}
        <text
          x={coordinates[coordinates.length - 1]?.x ?? 0}
          y={Math.max((coordinates[coordinates.length - 1]?.y ?? 0) - 10, 12)}
          textAnchor="end"
          className="fill-current text-[13px] font-medium text-text"
        >
          {formatValue(last.value)} {unit}
        </text>
      </svg>

      <figcaption className="mt-1 flex items-center justify-between gap-3 text-xs text-text-secondary">
        <span>
          {formatShortDate(first.date)} – {formatShortDate(last.date)}
        </span>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => {
            setShowTable((current) => !current);
          }}
          className="min-h-11 font-medium text-accent"
        >
          {showTable ? 'Сховати таблицю' : 'Показати таблицю'}
        </button>
      </figcaption>

      {showTable && (
        <div id={tableId} className="mt-1 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
                <th scope="col" className="py-1 font-medium">
                  Дата
                </th>
                <th scope="col" className="py-1 font-medium">
                  Значення
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {points.map((point) => (
                <tr key={point.date}>
                  <td className="py-1 text-text-secondary">{formatShortDate(point.date)}</td>
                  <td className="py-1 text-text">
                    {formatValue(point.value)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
