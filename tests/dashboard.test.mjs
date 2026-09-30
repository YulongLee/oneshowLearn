import assert from "node:assert/strict";
import test from "node:test";
import { courseProgress, courseStatus, dashboardCourses } from "../src/dashboard-model.js";

const library = [{ id: 1, progressPercent: 0 }, { id: 2, progressPercent: 40 }, { id: 3, progressPercent: 100 }];
test("dashboard never promotes a catalog-only course as owned or recently studied", () => {
  assert.equal(dashboardCourses([], { id: 99 }).current, null);
  assert.equal(dashboardCourses(library, { id: 99 }).current.id, 2);
  assert.equal(dashboardCourses(library, { id: 1 }).current.id, 1);
});
test("dashboard uses real progress for filters without modifying API data", () => {
  assert.deepEqual(dashboardCourses(library).counts, { all: 3, learning: 1, new: 1, completed: 1 });
  for (const [filter, id] of [["new", 1], ["learning", 2], ["completed", 3]]) {
    assert.deepEqual(dashboardCourses(library, null, filter).items.map(p => p.id), [id]);
  }
  assert.equal(library[0].progressPercent, 0);
});
test("progress is bounded and completion is never inferred for a new course", () => {
  for (const value of [undefined, "invalid", Infinity, -30]) assert.equal(courseProgress({ progressPercent: value }), 0);
  assert.equal(courseProgress({ progressPercent: 200 }), 100);
  assert.equal(courseStatus({ progressPercent: "10" }), "learning");
  assert.equal(courseStatus({}), "new");
});
