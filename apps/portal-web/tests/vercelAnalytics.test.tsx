import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { VercelAnalytics } from "../src/components/analytics/VercelAnalytics";

describe("VercelAnalytics component", () => {
  test("renders without crashing in server-rendered output", () => {
    const html = renderToString(<VercelAnalytics />);
    expect(typeof html).toBe("string");
  });
});
