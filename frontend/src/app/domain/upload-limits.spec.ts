import { describe, expect, it } from 'vitest';

import { uploadProblem } from './upload-limits';

const limits = { maxUploadBytes: 10 * 1024 * 1024, maxUpscaleSide: 1500 };

describe('uploadProblem', () => {
  it('accepts files within the limits', () => {
    expect(uploadProblem({ name: 'a.png', size: 1024 }, limits)).toBeNull();
    expect(
      uploadProblem({ name: 'a.png', size: 1024 }, limits, { width: 1500, height: 800 }),
    ).toBeNull();
  });

  it('rejects files over the upload size', () => {
    expect(uploadProblem({ name: 'big.jpg', size: 12 * 1024 * 1024 }, limits)).toBe(
      'big.jpg is 12.00 MB; the limit is 10.00 MB.',
    );
  });

  it('rejects images too large to upscale only when dimensions are given', () => {
    const file = { name: 'wide.png', size: 1024 };
    expect(uploadProblem(file, limits)).toBeNull();
    expect(uploadProblem(file, limits, { width: 1600, height: 900 })).toBe(
      'wide.png is 1600 × 900 px; the longest side can be at most 1500 px.',
    );
  });
});
