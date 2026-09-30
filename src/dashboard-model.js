// Learner-home selection is based on account entitlements, never the public catalog.
export function courseProgress(pack) {
  const value = Number(pack?.progressPercent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function courseStatus(pack) {
  const progress = courseProgress(pack);
  return progress >= 100 ? "completed" : progress > 0 ? "learning" : "new";
}

export function dashboardCourses(library = [], recent = null, filter = "all") {
  const current = library.find(pack => pack.id === recent?.id) ||
    library.find(pack => courseStatus(pack) === "learning") ||
    library.find(pack => courseStatus(pack) === "new") || library[0] || null;
  return {
    current,
    items: library.filter(pack => filter === "all" || courseStatus(pack) === filter),
    counts: {
      all: library.length,
      learning: library.filter(pack => courseStatus(pack) === "learning").length,
      new: library.filter(pack => courseStatus(pack) === "new").length,
      completed: library.filter(pack => courseStatus(pack) === "completed").length,
    },
  };
}
