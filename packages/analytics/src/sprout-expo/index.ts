import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { SproutCore } from "./core.js";
import type {
  PropertyValue,
  QueueStorage,
  SproutContext,
  SproutCoreOptions,
} from "./types.js";

export { SproutCore } from "./core.js";
export type {
  QueueStorage,
  SproutContext,
  SproutCoreOptions,
  SproutEvent,
  SproutEventType,
} from "./types.js";

export interface InitSproutOptions {
  /**
   * Your Convex deployment's *site* URL (https://<deployment>.convex.site).
   * The ingest path defaults to /sprout/ingest; pass `ingestUrl` to override
   * the full URL instead.
   */
  convexSiteUrl?: string;
  ingestUrl?: string;
  writeKey: string;
  /** Defaults to @react-native-async-storage/async-storage. */
  storage?: QueueStorage;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  sessionTimeoutMs?: number;
  onInternalError?: (error: unknown) => void;
}

let core: SproutCore | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let restoreErrorHandler: (() => void) | null = null;

function deviceContext(): SproutContext {
  return {
    appVersion: Constants.expoConfig?.version ?? undefined,
    buildNumber:
      Constants.expoConfig?.ios?.buildNumber ??
      (Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : undefined),
    osName: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion ?? undefined,
    deviceModel: Device.modelName ?? undefined,
  };
}

function wireAppState(instance: SproutCore): void {
  appStateSubscription =
    AppState.addEventListener("change", (state) => {
      void instance.handleAppStateChange(state);
    }) ?? null;
}

function wireErrorHandler(instance: SproutCore): void {
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    void instance.captureException(error, { fatal: !!isFatal });
    previous?.(error, isFatal);
  });
  restoreErrorHandler = () => {
    if (previous) errorUtils.setGlobalHandler(previous);
  };
}

// Note: unhandled promise rejections are not yet captured. Hermes/RN don't
// expose a Metro-safe, always-present hook for this the way ErrorUtils does
// for synchronous errors -- `promise/setimmediate/rejection-tracking` is not
// reliably present across Expo SDK versions, and Metro can't conditionally
// skip an unresolvable static import the way Node's dynamic `require` can.
// Revisit if a stable cross-version hook is confirmed.

/**
 * Initialize Sprout at app root (before or inside your root layout).
 * Idempotent -- repeat calls return the existing instance.
 */
export async function initSprout(
  options: InitSproutOptions,
): Promise<SproutCore> {
  if (core) return core;

  const ingestUrl =
    options.ingestUrl ??
    (options.convexSiteUrl
      ? `${options.convexSiteUrl.replace(/\/$/, "")}/sprout/ingest`
      : undefined);
  if (!ingestUrl) {
    throw new Error("initSprout: pass convexSiteUrl or ingestUrl");
  }

  const coreOptions: SproutCoreOptions = {
    ingestUrl,
    writeKey: options.writeKey,
    storage: options.storage ?? AsyncStorage,
    flushIntervalMs: options.flushIntervalMs,
    maxBatchSize: options.maxBatchSize,
    maxQueueSize: options.maxQueueSize,
    sessionTimeoutMs: options.sessionTimeoutMs,
    getContext: deviceContext,
    onInternalError: options.onInternalError,
  };

  core = new SproutCore(coreOptions);
  await core.init();
  wireAppState(core);
  wireErrorHandler(core);
  return core;
}

/** The active instance, or null before initSprout resolves. */
export function getSprout(): SproutCore | null {
  return core;
}

/**
 * Tear down the singleton: stops timers, unhooks AppState and ErrorUtils,
 * and persists the queue (nothing is lost -- a later initSprout resumes it).
 */
export function shutdownSprout(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
  restoreErrorHandler?.();
  restoreErrorHandler = null;
  core?.shutdown();
  core = null;
}

export function track(
  name: string,
  properties?: Record<string, PropertyValue>,
): void {
  void core?.track(name, properties);
}

export function screen(
  name: string,
  properties?: Record<string, PropertyValue>,
): void {
  void core?.screen(name, properties);
}

export function identify(
  userId: string,
  traits?: Record<string, PropertyValue>,
): void {
  void core?.identify(userId, traits);
}

export function captureException(
  error: unknown,
  extra?: { properties?: Record<string, PropertyValue>; fatal?: boolean },
): void {
  void core?.captureException(error, extra);
}
