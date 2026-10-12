import { describe, expect, it } from 'vitest';
import { formatPosition, interpolate, normalizeLon } from './geo';
import { unwrapNear } from './routing/seagrid';

describe('longitudes', () => {
  it('normalises to -180…180 without looping', () => {
    expect(normalizeLon(12.5)).toBe(12.5);
    expect(normalizeLon(190)).toBeCloseTo(-170);
    expect(normalizeLon(-190)).toBeCloseTo(170);
    expect(normalizeLon(3600 + 45)).toBeCloseTo(45);
    expect(normalizeLon(1e15)).toBeGreaterThanOrEqual(-180);
    // a bad value must never hang the chart or the labels
    expect(normalizeLon(Infinity)).toBe(0);
    expect(normalizeLon(NaN)).toBe(0);
    expect(formatPosition([Infinity, 55.69])).toContain('N');
  });

  it('unwraps onto the branch nearest the reference', () => {
    expect(unwrapNear(-179, 179)).toBeCloseTo(181);
    expect(unwrapNear(179, -179)).toBeCloseTo(-181);
    expect(unwrapNear(10, 12)).toBe(10);
    expect(unwrapNear(Infinity, 0)).toBe(Infinity);
  });

  it('interpolates across the date line on one continuous branch', () => {
    const [lon] = interpolate([179, -17], [181, -17], 0.5);
    expect(lon).toBeCloseTo(180, 1);
  });
});
