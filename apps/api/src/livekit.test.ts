import { describe, expect, it } from "vitest";
import {
  liveReviewGrant,
  userPreviewPublisherGrant,
  userPreviewSubscriberGrant
} from "./livekit.js";

describe("live review grants", () => {
  it("keeps previews hidden and subscribe-only", () => {
    expect(liveReviewGrant("observe", "room-1")).toEqual({
      room: "room-1",
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
      hidden: true
    });
  });

  it("makes an interactive superuser visible and able to publish", () => {
    expect(liveReviewGrant("connect", "room-1")).toEqual({
      room: "room-1",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      hidden: false
    });
  });

  it("keeps user camera presence hidden and publish-only", () => {
    expect(userPreviewPublisherGrant("preview-1")).toEqual({
      room: "preview-1",
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
      hidden: true
    });
  });

  it("gives the superuser a hidden subscribe-only camera preview", () => {
    expect(userPreviewSubscriberGrant("preview-1")).toEqual({
      room: "preview-1",
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
      hidden: true
    });
  });
});
