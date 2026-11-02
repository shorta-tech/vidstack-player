import { createComponent, scoped } from 'maverick.js';
import { vi } from 'vitest';

import { MediaPlayer } from '../../components/player';
import { useMediaContext } from '../../core/api/media-context';
import { HLSLibLoader } from './lib-loader';
import type { HLSConstructor } from './types';

it('ignores a library import that resolves after the player is destroyed', async () => {
  const player = createComponent(MediaPlayer),
    ctx = scoped(useMediaContext, player.scope)!,
    onLoaded = vi.fn();
  let release!: (module: { default: HLSConstructor }) => void;
  const pending = new Promise<{ default: HLSConstructor }>((resolve) => {
      release = resolve;
    }),
    started = vi.fn(),
    load = () => {
      started();
      return pending;
    };

  scoped(() => new HLSLibLoader(load, ctx, onLoaded), player.scope);
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());

  player.destroy();
  expect(ctx.player).toBeNull();
  release(await import('hls.js'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(onLoaded).not.toHaveBeenCalled();
});

it('ignores an import failure after the player is destroyed', async () => {
  const player = createComponent(MediaPlayer),
    ctx = scoped(useMediaContext, player.scope)!,
    onLoaded = vi.fn();
  let reject!: (reason: Error) => void;
  const pending = new Promise<{ default: HLSConstructor }>((_, rejectImport) => {
      reject = rejectImport;
    }),
    started = vi.fn(),
    load = () => {
      started();
      return pending;
    };

  scoped(() => new HLSLibLoader(load, ctx, onLoaded), player.scope);
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
  player.destroy();
  expect(ctx.player).toBeNull();
  reject(new Error('The library download failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(onLoaded).not.toHaveBeenCalled();
});

it('does not start an import after its scope has already been disposed', async () => {
  const player = createComponent(MediaPlayer),
    ctx = scoped(useMediaContext, player.scope)!,
    started = vi.fn(),
    onLoaded = vi.fn(),
    load = () => {
      started();
      return import('hls.js');
    };

  scoped(() => new HLSLibLoader(load, ctx, onLoaded), player.scope);
  player.destroy();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(started).not.toHaveBeenCalled();
  expect(onLoaded).not.toHaveBeenCalled();
});

it('still dispatches loaded events and initializes an active player', async () => {
  const player = createComponent(MediaPlayer),
    ctx = scoped(useMediaContext, player.scope)!,
    onLoaded = vi.fn(),
    dispatch = vi.spyOn(player, 'dispatch');
  class TestHLS {
    static isSupported() {
      return true;
    }
  }
  const ctor = TestHLS as unknown as HLSConstructor;

  try {
    scoped(() => new HLSLibLoader(async () => ({ default: ctor }), ctx, onLoaded), player.scope);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledWith(ctor));
    // Maverick's node export uses an Event stub without `type` in jsdom.
    // The loader must still dispatch start/loaded and deliver the constructor.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0]).toHaveProperty('detail', ctor);
  } finally {
    player.destroy();
  }
});
