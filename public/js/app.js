// Campus Super App — Academic Portal Front-End Controller

// ----------------------------------------------------
// 0. API BACKEND RESOLVER (FOR VERCEL & DECOUPLED DEPLOYMENTS)
// ----------------------------------------------------
function getApiBase() {
  const stored = localStorage.getItem("CAMPUS_API_BASE");
  if (stored) return stored.trim().replace(/\/+$/, "");
  if (window.CAMPUS_API_BASE) return window.CAMPUS_API_BASE.trim().replace(/\/+$/, "");
  return "";
}

function promptBackendUrl() {
  const current = getApiBase();
  const input = prompt(
    "Enter your live Backend API URL (e.g. https://your-backend.onrender.com):",
    current || "https://"
  );
  if (input !== null) {
    const cleaned = input.trim().replace(/\/+$/, "");
    if (cleaned && cleaned !== "https://" && cleaned !== "http://") {
      localStorage.setItem("CAMPUS_API_BASE", cleaned);
    } else {
      localStorage.removeItem("CAMPUS_API_BASE");
    }
    window.location.reload();
  }
}

// Global fetch interceptor to redirect /api/v1 calls to the configured backend
const _originalFetch = window.fetch;
window.fetch = async function (resource, init) {
  let url = resource;
  if (typeof resource === "string" && resource.startsWith("/api/v1")) {
    const base = getApiBase();
    if (base) {
      url = `${base}${resource}`;
    }
  }

  const response = await _originalFetch.call(this, url, init);

  // Wrap res.json() to gracefully handle HTML responses (e.g. Vercel 404 pages)
  const _originalJson = response.json;
  response.json = async function () {
    const clone = response.clone();
    try {
      return await _originalJson.call(response);
    } catch (err) {
      const text = await clone.text();
      if (text.includes("<!DOCTYPE") || text.includes("<html") || text.includes("The page could not be found")) {
        console.warn(`[API Resolver] Endpoint "${url}" returned HTML instead of JSON. Ensure your Backend URL is set.`);
        return { success: false, error: { message: "Backend API not reachable at current host" } };
      }
      throw err;
    }
  };

  return response;
};

// Check if running on Vercel without configured backend and display banner
document.addEventListener("DOMContentLoaded", () => {
  const isVercel = window.location.hostname.includes("vercel.app");
  const hasCustomBase = Boolean(getApiBase());
  const banner = document.getElementById("backendBanner");
  const bannerBtn = document.getElementById("bannerConfigBtn");
  const headerBtn = document.getElementById("openBackendConfigBtn");

  if (isVercel && !hasCustomBase && banner) {
    banner.style.display = "block";
  }

  if (bannerBtn) {
    bannerBtn.addEventListener("click", promptBackendUrl);
  }

  if (headerBtn) {
    headerBtn.addEventListener("click", promptBackendUrl);
    if (hasCustomBase) {
      headerBtn.innerText = "🌐 Connected";
      headerBtn.title = `Connected to: ${getApiBase()}`;
    }
  }
});

let activeAssignment = null;
let selectedFile = null;
let currentUser = null;

function getAuthHeader() {
  const token = localStorage.getItem("campus_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ----------------------------------------------------
// AUTHENTICATION & SESSION MANAGEMENT
// ----------------------------------------------------
async function checkAuthSession() {
  const token = localStorage.getItem("campus_access_token");
  const displayName = document.getElementById("userDisplayName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!token) {
    currentUser = null;
    displayName.innerText = "Guest (Not Logged In)";
    logoutBtn.style.display = "none";
    return false;
  }

  try {
    const res = await fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();

    if (result.success && result.data) {
      currentUser = result.data;
      const roleStr = currentUser.globalRoles?.[0] || "USER";
      displayName.innerText = `👤 ${currentUser.fullName} (${roleStr})`;
      logoutBtn.style.display = "inline-block";

      if (currentUser.globalRoles?.includes("ADMIN")) {
        const modBtn = document.getElementById("viewAdminModerationBtn");
        if (modBtn) modBtn.style.display = "inline-flex";
        const aiAdminBtn = document.getElementById("openAiAnalyticsBtn");
        if (aiAdminBtn) aiAdminBtn.style.display = "inline-flex";
        const adminTabBtn = document.getElementById("adminTabBtn");
        if (adminTabBtn) adminTabBtn.style.display = "inline-flex";
      }
      return true;
    } else {
      localStorage.removeItem("campus_access_token");
      currentUser = null;
      displayName.innerText = "Guest (Session Expired)";
      logoutBtn.style.display = "none";
      return false;
    }
  } catch (err) {
    console.error("Auth verification failed:", err);
    return false;
  }
}

document.getElementById("openAuthModalBtn").addEventListener("click", () => {
  document.getElementById("authModal").classList.remove("hidden");
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const result = await res.json();

    if (result.success && result.data?.accessToken) {
      localStorage.setItem("campus_access_token", result.data.accessToken);
      alert("✅ Logged in successfully!");
      closeModal("authModal");
      await checkAuthSession();
      loadDashboard();
      loadNotifications();
    } else {
      alert(`Login failed: ${result.error?.message || result.error || "Invalid credentials"}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
});

document.getElementById("saveManualTokenBtn").addEventListener("click", async () => {
  const token = document.getElementById("manualTokenInput").value.trim();
  if (!token) return alert("Please enter a valid JWT token");
  localStorage.setItem("campus_access_token", token);
  closeModal("authModal");
  await checkAuthSession();
  loadDashboard();
  loadNotifications();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("campus_access_token");
  currentUser = null;
  checkAuthSession();
  closeModal("authModal");
  loadDashboard();
});

// ----------------------------------------------------
// UI TABS & NAVIGATION
// ----------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));

    btn.classList.add("active");
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.remove("hidden");

    if (btn.dataset.tab === "dashboard") loadDashboard();
    if (btn.dataset.tab === "materials") {
      loadMaterials();
      loadMaterialsStats();
      loadMaterialsOfferings();
    }
    if (btn.dataset.tab === "archive") {
      loadArchive();
      loadArchiveStats();
      loadArchiveOfferings();
    }
    if (btn.dataset.tab === "quizzes") {
      loadQuizzesOfferings();
      loadQuizzes();
    }
    if (btn.dataset.tab === "blog") {
      loadBlogPosts();
    }
    if (btn.dataset.tab === "ai") {
      loadAiOfferings();
      loadAiQuota();
      loadAiConversations();
    }
    if (btn.dataset.tab === "groups") loadGroupAssignmentsDropdown();
    if (btn.dataset.tab === "teacher") loadTeacherOfferings();
    if (btn.dataset.tab === "admin") loadAdminAnalytics();
  });
});

// Notification Dropdown Toggle
const notifBellBtn = document.getElementById("notifBellBtn");
const notifDropdown = document.getElementById("notifDropdown");
notifBellBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdown.style.display = notifDropdown.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", () => {
  if (notifDropdown) notifDropdown.style.display = "none";
});

// ----------------------------------------------------
// 1. STUDENT ASSIGNMENT DASHBOARD
// ----------------------------------------------------
async function loadDashboard() {
  const container = document.getElementById("assignmentsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading assignments...</div>';

  const token = localStorage.getItem("campus_access_token");
  if (!token) {
    container.innerHTML = `
      <div style="text-align:center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
        <h3>Welcome to Campus Super App Academic Portal</h3>
        <p style="color: var(--neutral-600); margin: 0.5rem 0 1.5rem;">Please log in with your Campus ID to view your enrolled courses and assignments.</p>
        <button class="btn btn-primary" onclick="document.getElementById('authModal').classList.remove('hidden')">Log In Now</button>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch("/api/v1/assignments/dashboard/student", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${result.error}</div>`;
      return;
    }

    const { summary, categories } = result.data;

    // Update Metrics
    document.getElementById("metricTotal").innerText = summary.total;
    document.getElementById("metricUpcoming").innerText = summary.upcoming;
    document.getElementById("metricSubmitted").innerText = summary.submitted;
    document.getElementById("metricOverdue").innerText = summary.overdue;
    document.getElementById("metricGraded").innerText = summary.graded;

    // Filters
    const statusFilter = document.getElementById("statusFilter").value;
    const typeFilter = document.getElementById("typeFilter").value;

    let items = [];
    if (statusFilter === "ALL") {
      items = [
        ...categories.upcoming,
        ...categories.submitted,
        ...categories.overdue,
        ...categories.graded,
      ];
    } else {
      items = categories[statusFilter.toLowerCase()] || [];
    }

    if (typeFilter !== "ALL") {
      items = items.filter((a) => a.type === typeFilter);
    }

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--neutral-600); background: white; border-radius: 8px;">No assignments found for the selected criteria.</div>`;
      return;
    }

    container.innerHTML = items.map((a) => renderAssignmentCard(a)).join("");
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${err.message}</div>`;
  }
}

function renderAssignmentCard(a) {
  const badgeClass =
    a.status === "GRADED"
      ? "badge-graded"
      : a.status === "SUBMITTED"
      ? "badge-submitted"
      : a.status === "LATE_SUBMITTED"
      ? "badge-late"
      : a.status === "OVERDUE"
      ? "badge-overdue"
      : "badge-upcoming";

  const isGroup = a.type === "GROUP";

  return `
    <div class="assignment-card">
      <div class="card-header">
        <div>
          <div class="course-tag">${a.courseCode} — ${a.courseName}</div>
          <h3 class="card-title">${a.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${isGroup ? '<span class="badge badge-group">👥 Group Assignment</span>' : ""}
          <span class="badge ${badgeClass}">${a.status.replace("_", " ")}</span>
        </div>
      </div>

      <p style="color: var(--neutral-600); font-size: 0.95rem; margin-bottom: 1rem;">${a.description}</p>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem;">
        <div class="countdown-box">
          ⏰ ${a.timeRemainingText} (Due: ${new Date(a.dueDate).toLocaleDateString()})
        </div>
        ${a.maxMarks ? `<div><strong>Marks:</strong> ${a.maxMarks} pts</div>` : ""}
        ${
          a.submission && a.submission.grade !== null
            ? `<div style="color: var(--success); font-weight: 700;">Score: ${a.submission.grade}/${a.maxMarks} pts</div>`
            : ""
        }
      </div>

      ${
        a.submission && a.submission.feedback
          ? `<div style="margin-top: 0.75rem; background: #faf5ff; border-left: 3px solid #8b5cf6; padding: 0.5rem 0.75rem; font-size: 0.85rem;">
              <strong>Teacher Feedback:</strong> ${a.submission.feedback}
             </div>`
          : ""
      }

      <div class="card-footer">
        <div>
          ${
            a.submission
              ? `<span style="font-size: 0.85rem; color: var(--neutral-600);">Submitted v${a.submission.version} on ${new Date(a.submission.submittedAt).toLocaleDateString()}</span>`
              : `<span style="font-size: 0.85rem; color: var(--neutral-600);">Not submitted yet</span>`
          }
        </div>
        <button class="btn btn-primary btn-sm" onclick="openSubmissionModal('${a.id}')">
          ${a.submission ? "View / Resubmit" : "Submit Work"}
        </button>
      </div>
    </div>
  `;
}

document.getElementById("statusFilter").addEventListener("change", loadDashboard);
document.getElementById("typeFilter").addEventListener("change", loadDashboard);
document.getElementById("refreshDashboardBtn").addEventListener("click", loadDashboard);

// ----------------------------------------------------
// 2. SUBMISSION MODAL & DRAG-AND-DROP
// ----------------------------------------------------
async function openSubmissionModal(assignmentId) {
  selectedFile = null;
  document.getElementById("selectedFileName").style.display = "none";
  document.getElementById("submitFileBtn").disabled = true;

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    activeAssignment = result.data;
    document.getElementById("subModalTitle").innerText = activeAssignment.title;

    let attachHtml = "";
    if (activeAssignment.attachments && activeAssignment.attachments.length > 0) {
      attachHtml = `
        <div style="margin-top: 0.5rem;">
          <strong>Attachments:</strong>
          <ul style="margin-left: 1.25rem; font-size: 0.85rem;">
            ${activeAssignment.attachments
              .map(
                (att) =>
                  `<li><a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(
                    att.fileKey
                  )}" target="_blank">${att.fileName}</a> (${Math.round(
                    att.fileSize / 1024
                  )} KB)</li>`
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    document.getElementById("subModalDetails").innerHTML = `
      <p style="font-size: 0.9rem; color: var(--neutral-600);">${activeAssignment.description}</p>
      ${
        activeAssignment.instructions
          ? `<p style="font-size: 0.85rem; margin-top: 0.5rem; background: var(--neutral-100); padding: 0.5rem; border-radius: 4px;"><strong>Instructions:</strong> ${activeAssignment.instructions}</p>`
          : ""
      }
      ${attachHtml}
    `;

    // Load submission history
    loadSubmissionHistory(assignmentId);

    document.getElementById("submissionModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

async function loadSubmissionHistory(assignmentId) {
  const container = document.getElementById("versionHistoryTable");
  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/submissions/my`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `<p style="color: var(--neutral-600); font-size: 0.85rem; margin-top: 0.5rem;">No submissions recorded yet.</p>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>File</th>
            <th>Date</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${result.data
            .map(
              (sub) => `
            <tr>
              <td><strong>v${sub.version}</strong> ${sub.isCurrentVersion ? "🌟 (Current)" : ""}</td>
              <td>${sub.fileName}</td>
              <td>${new Date(sub.submittedAt).toLocaleString()}</td>
              <td><span class="badge ${sub.status === "GRADED" ? "badge-graded" : "badge-submitted"}">${sub.status}</span></td>
              <td>
                <a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(sub.fileKey)}" class="btn btn-secondary btn-sm">Download</a>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger); font-size: 0.85rem;">Failed to load submission history.</p>`;
  }
}

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("submissionFileInput");

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFileSelected(e.dataTransfer.files[0]);
  }
});

function handleFileSelected(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert("File size exceeds 50MB limit.");
    return;
  }
  selectedFile = file;
  const label = document.getElementById("selectedFileName");
  label.innerText = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  label.style.display = "block";
  document.getElementById("submitFileBtn").disabled = false;
}

document.getElementById("submitFileBtn").addEventListener("click", async () => {
  if (!activeAssignment || !selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);

  const btn = document.getElementById("submitFileBtn");
  btn.disabled = true;
  btn.innerText = "Uploading & Validating...";

  try {
    const res = await fetch(`/api/v1/assignments/${activeAssignment.id}/submit`, {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Submission Error: ${result.error}`);
    } else {
      alert("✅ Assignment submitted successfully!");
      loadSubmissionHistory(activeAssignment.id);
      loadDashboard();
      selectedFile = null;
      document.getElementById("selectedFileName").style.display = "none";
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "🚀 Confirm & Upload Submission";
  }
});

// ----------------------------------------------------
// 3. GROUP COLLABORATION
// ----------------------------------------------------
async function loadGroupAssignmentsDropdown() {
  const select = document.getElementById("groupAssignmentSelect");
  select.innerHTML = '<option value="">Select an assignment...</option>';

  try {
    const res = await fetch("/api/v1/assignments/dashboard/student", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const all = [
      ...result.data.categories.upcoming,
      ...result.data.categories.submitted,
      ...result.data.categories.overdue,
      ...result.data.categories.graded,
    ];

    const groupAssignments = all.filter((a) => a.type === "GROUP");
    select.innerHTML =
      '<option value="">Select a group assignment...</option>' +
      groupAssignments.map((a) => `<option value="${a.id}">${a.courseCode} — ${a.title}</option>`).join("");
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("groupAssignmentSelect").addEventListener("change", async (e) => {
  const assignmentId = e.target.value;
  if (!assignmentId) return;

  const container = document.getElementById("groupsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading groups...</div>';

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/groups`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    if (result.data.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; background: white; border-radius: 8px;">No groups created yet. Be the first to start a team!</div>`;
      return;
    }

    container.innerHTML = result.data
      .map(
        (g) => `
        <div class="assignment-card" style="margin-bottom: 1rem;">
          <div class="card-header">
            <div>
              <h3 class="card-title">${g.name}</h3>
              <p style="font-size: 0.85rem; color: var(--neutral-600);">${g.members.length} Members</p>
            </div>
            <div>
              ${g.isLocked ? '<span class="badge badge-overdue">🔒 Locked (Submitted)</span>' : '<span class="badge badge-submitted">Open</span>'}
            </div>
          </div>
          <div style="font-size: 0.85rem; margin: 0.5rem 0;">
            <strong>Members:</strong> ${g.members.map((m) => `${m.user.fullName} ${m.isLeader ? "(Leader)" : ""}`).join(", ")}
          </div>
          <div style="margin-top: 0.75rem;">
            ${!g.isLocked ? `<button class="btn btn-secondary btn-sm" onclick="joinGroup('${assignmentId}', '${g.id}')">Join Team</button>` : ""}
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">${err.message}</div>`;
  }
});

async function joinGroup(assignmentId, groupId) {
  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/groups/${groupId}/join`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);
    alert("Joined group successfully!");
    document.getElementById("groupAssignmentSelect").dispatchEvent(new Event("change"));
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// 4. TEACHER MANAGEMENT & GRADING
// ----------------------------------------------------
async function loadTeacherOfferings() {
  const select = document.getElementById("teacherOfferingSelect");
  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const offerings = result.data.instructedOfferings || [];
    select.innerHTML =
      '<option value="">Select course offering...</option>' +
      offerings
        .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
        .join("");
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("teacherOfferingSelect").addEventListener("change", async (e) => {
  const offeringId = e.target.value;
  if (!offeringId) return;

  const container = document.getElementById("submissionsTableContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading submissions...</div>';

  try {
    const res = await fetch(`/api/v1/assignments/offering/${offeringId}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success || result.data.length === 0) {
      container.innerHTML = '<p style="color: var(--neutral-600);">No assignments found for this course offering.</p>';
      return;
    }

    const assignment = result.data[0];
    const subRes = await fetch(`/api/v1/assignments/${assignment.id}/submissions`, {
      headers: getAuthHeader(),
    });
    const subResult = await subRes.json();

    if (!subResult.success || subResult.data.length === 0) {
      container.innerHTML = `<p style="color: var(--neutral-600);">No student submissions received yet for "${assignment.title}".</p>`;
      return;
    }

    container.innerHTML = `
      <h4>Submissions for: ${assignment.title} (Max Marks: ${assignment.maxMarks || "N/A"})</h4>
      <table>
        <thead>
          <tr>
            <th>Student / Team</th>
            <th>File</th>
            <th>Submitted At</th>
            <th>Status</th>
            <th>Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${subResult.data
            .map((sub) => {
              const name = sub.student ? sub.student.fullName : sub.group ? sub.group.name : "Unknown";
              return `
              <tr>
                <td><strong>${name}</strong></td>
                <td><a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(sub.fileKey)}">${sub.fileName}</a></td>
                <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                <td><span class="badge ${sub.status === "GRADED" ? "badge-graded" : "badge-submitted"}">${sub.status}</span></td>
                <td>${sub.grade !== null ? `${sub.grade} pts` : "—"}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="openGradeModal('${sub.id}', '${assignment.id}', '${name}', ${assignment.maxMarks || 100}, ${sub.grade || 'null'})">
                    Grade
                  </button>
                </td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">${err.message}</div>`;
  }
});

function openGradeModal(submissionId, assignmentId, studentName, maxMarks, currentGrade) {
  document.getElementById("gradeSubmissionId").value = submissionId;
  document.getElementById("gradeAssignmentId").value = assignmentId;
  document.getElementById("gradeScoreInput").value = currentGrade !== null ? currentGrade : "";
  document.getElementById("gradeScoreInput").max = maxMarks;
  document.getElementById("gradeModalDetails").innerHTML = `
    <p><strong>Grading submission for:</strong> ${studentName}</p>
    <p style="font-size: 0.85rem; color: var(--neutral-600);">Maximum allowed marks: ${maxMarks} points</p>
  `;
  document.getElementById("gradeModal").classList.remove("hidden");
}

document.getElementById("gradeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submissionId = document.getElementById("gradeSubmissionId").value;
  const assignmentId = document.getElementById("gradeAssignmentId").value;
  const score = document.getElementById("gradeScoreInput").value;
  const feedback = document.getElementById("gradeFeedbackInput").value;

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ grade: parseFloat(score), feedback }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert("✅ Grade recorded and student notified!");
    closeModal("gradeModal");
    document.getElementById("teacherOfferingSelect").dispatchEvent(new Event("change"));
  } catch (err) {
    alert(err.message);
  }
});

// ----------------------------------------------------
// 5. NOTIFICATIONS
// ----------------------------------------------------
async function loadNotifications() {
  try {
    const res = await fetch("/api/v1/notifications", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const badge = document.getElementById("notifBadge");
    const count = result.data.unreadCount;
    if (count > 0) {
      badge.innerText = count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }

    const list = document.getElementById("notifList");
    if (result.data.notifications.length === 0) {
      list.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--neutral-600);">No notifications</div>';
      return;
    }

    list.innerHTML = result.data.notifications
      .map(
        (n) => `
        <div class="notification-item ${n.isRead ? "" : "unread"}" onclick="markNotificationRead('${n.id}')">
          <div style="font-weight: 600; color: var(--neutral-900);">${n.title}</div>
          <div style="color: var(--neutral-600); margin-top: 0.2rem;">${n.message}</div>
          <div style="font-size: 0.75rem; color: var(--neutral-600); margin-top: 0.3rem;">${new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

async function markNotificationRead(id) {
  try {
    await fetch(`/api/v1/notifications/${id}/read`, {
      method: "PATCH",
      headers: getAuthHeader(),
    });
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("markAllReadBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/v1/notifications/read-all", {
      method: "PATCH",
      headers: getAuthHeader(),
    });
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
});

// ----------------------------------------------------
// UTILITY / MODAL HANDLERS
// ----------------------------------------------------
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

document.getElementById("openCreateAssignmentModalBtn")?.addEventListener("click", () => {
  document.getElementById("createAssignmentModal").classList.remove("hidden");
});

document.getElementById("openCreateGroupBtn")?.addEventListener("click", () => {
  document.getElementById("createGroupModal").classList.remove("hidden");
});

// ----------------------------------------------------
// 6. LEARNING MATERIALS & ACADEMIC RESOURCES
// ----------------------------------------------------
async function loadMaterials() {
  const container = document.getElementById("materialsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading academic resources...</div>';

  const category = document.getElementById("materialsCategoryFilter")?.value || "";
  const courseOfferingId = document.getElementById("materialsOfferingFilter")?.value || "";
  const search = document.getElementById("materialsSearchInput")?.value?.trim() || "";
  const sortBy = document.getElementById("materialsSortBy")?.value || "newest";

  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (search) params.append("search", search);
  if (sortBy) params.append("sortBy", sortBy);

  try {
    const res = await fetch(`/api/v1/materials?${params.toString()}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${result.error}</div>`;
      return;
    }

    const { materials, pagination } = result.data;

    if (materials.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; color: var(--neutral-600);">No academic resources found matching your search.</div>`;
      return;
    }

    container.innerHTML = materials.map((m) => renderMaterialCard(m)).join("");

    // Check if user has teacher/admin rights to show moderation queue
    checkAndLoadModerationQueue();
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${err.message}</div>`;
  }
}

function renderMaterialCard(m) {
  const sizeMb = (m.fileSize / (1024 * 1024)).toFixed(2);
  const sizeKb = Math.round(m.fileSize / 1024);
  const sizeStr = m.fileSize >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const categoryLabel = m.category.replace(/_/g, " ");

  const isPending = m.status === "PENDING";
  const isRejected = m.status === "REJECTED";

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${m.courseOffering?.course?.code || "COURSE"} — ${m.courseOffering?.course?.title || "Academic Course"}</div>
          <h3 class="card-title">${m.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">📂 ${categoryLabel}</span>
          ${isPending ? '<span class="badge badge-late">⏳ Pending Review</span>' : ""}
          ${isRejected ? '<span class="badge badge-overdue">❌ Rejected</span>' : ""}
        </div>
      </div>

      ${m.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${m.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>📄 <strong>File:</strong> ${m.fileName} (${sizeStr})</div>
        <div>👤 <strong>Uploaded By:</strong> ${m.uploader?.fullName || "Faculty"}</div>
        <div>📥 <strong>Downloads:</strong> ${m.downloads}</div>
        <div>📅 <strong>Date:</strong> ${new Date(m.createdAt).toLocaleDateString()}</div>
      </div>

      ${m.tags ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--accent);">🏷️ Tags: ${m.tags}</div>` : ""}

      <div class="card-footer">
        <div>
          ${m.moderationNote ? `<span style="font-size: 0.8rem; color: #b45309;">Note: ${m.moderationNote}</span>` : ""}
        </div>
        <div>
          <a href="/api/v1/materials/${m.id}/download" class="btn btn-primary btn-sm" download target="_blank">
            📥 Download Resource
          </a>
        </div>
      </div>
    </div>
  `;
}

async function loadMaterialsStats() {
  try {
    const res = await fetch("/api/v1/materials/stats", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    document.getElementById("metricMaterialsTotal").innerText = result.data.totalResources;
    document.getElementById("metricMaterialsDownloads").innerText = result.data.totalDownloads;
  } catch (err) {
    console.error("Failed to load materials stats:", err);
  }
}

async function loadMaterialsOfferings() {
  const selectFilter = document.getElementById("materialsOfferingFilter");
  const selectUpload = document.getElementById("matCourseOfferingSelect");

  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];

    // Deduplicate offerings by id
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());

    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Enrolled Courses</option>' + optionsHtml;
    }
    if (selectUpload) {
      selectUpload.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load course offerings:", err);
  }
}

async function checkAndLoadModerationQueue() {
  const section = document.getElementById("materialsModerationSection");
  const list = document.getElementById("pendingModerationList");
  const badge = document.getElementById("pendingModerationBadge");

  try {
    const res = await fetch("/api/v1/materials/moderation/queue", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    badge.innerText = `${result.data.length} Pending`;

    list.innerHTML = result.data
      .map(
        (item) => `
        <div style="background: white; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong>${item.title}</strong> (${item.fileName})
            <div style="font-size: 0.8rem; color: var(--neutral-600);">
              Course: ${item.courseOffering.course.title} | Uploader: ${item.uploader.fullName} | Cat: ${item.category}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-success btn-sm" onclick="openModerateModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'APPROVED')">
              ✅ Approve
            </button>
            <button class="btn btn-danger btn-sm" onclick="openModerateModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'REJECTED')">
              ❌ Reject
            </button>
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    section.classList.add("hidden");
  }
}

function openModerateModal(materialId, title, defaultAction) {
  document.getElementById("modMaterialId").value = materialId;
  document.getElementById("modActionSelect").value = defaultAction;
  document.getElementById("modMaterialDetails").innerHTML = `
    <p><strong>Reviewing Resource:</strong> ${title}</p>
  `;
  document.getElementById("moderateMaterialModal").classList.remove("hidden");
}

document.getElementById("moderateMaterialForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const materialId = document.getElementById("modMaterialId").value;
  const status = document.getElementById("modActionSelect").value;
  const note = document.getElementById("modNoteInput").value;

  try {
    const res = await fetch(`/api/v1/materials/${materialId}/moderate`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    alert(`✅ Resource status updated to: ${status}`);
    closeModal("moderateMaterialModal");
    loadMaterials();
    loadMaterialsStats();
  } catch (err) {
    alert(err.message);
  }
});

// Upload Material Form Handler
document.getElementById("openUploadMaterialModalBtn")?.addEventListener("click", () => {
  loadMaterialsOfferings();
  document.getElementById("uploadMaterialModal").classList.remove("hidden");
});

document.getElementById("uploadMaterialForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("matFileInput");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please select a file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("title", document.getElementById("matTitle").value.trim());
  formData.append("description", document.getElementById("matDescription").value.trim());
  formData.append("category", document.getElementById("matCategory").value);
  formData.append("courseOfferingId", document.getElementById("matCourseOfferingSelect").value);
  formData.append("tags", document.getElementById("matTags").value.trim());
  formData.append("file", fileInput.files[0]);

  const submitBtn = document.getElementById("uploadMaterialSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Uploading & Hashing...";

  try {
    const res = await fetch("/api/v1/materials", {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Upload Error: ${result.error}`);
    } else {
      const isApproved = result.data.status === "APPROVED";
      alert(isApproved ? "✅ Resource published directly!" : "ℹ️ Resource submitted for faculty moderation!");
      closeModal("uploadMaterialModal");
      document.getElementById("uploadMaterialForm").reset();
      loadMaterials();
      loadMaterialsStats();
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "🚀 Publish Resource";
  }
});

// Materials Filter Listeners
document.getElementById("materialsCategoryFilter")?.addEventListener("change", loadMaterials);
document.getElementById("materialsOfferingFilter")?.addEventListener("change", loadMaterials);
document.getElementById("materialsSortBy")?.addEventListener("change", loadMaterials);
document.getElementById("refreshMaterialsBtn")?.addEventListener("click", () => {
  loadMaterials();
  loadMaterialsStats();
});
document.getElementById("materialsSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") loadMaterials();
});

// Archive Filter Listeners
// ----------------------------------------------------
// 6. ACADEMIC ARCHIVE & PAST EXAMS
// ----------------------------------------------------
let activeArchiveType = "";

document.querySelectorAll(".archive-type-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".archive-type-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");
    activeArchiveType = pill.dataset.type || "";
    loadArchive();
  });
});

async function loadArchiveOfferings() {
  const selectFilter = document.getElementById("archiveOfferingFilter");
  const selectUpload = document.getElementById("arcCourseOfferingSelect");
  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());
    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Courses</option>' + optionsHtml;
    }
    if (selectUpload) {
      selectUpload.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load archive course offerings:", err);
  }
}

async function loadArchiveStats() {
  try {
    await fetch("/api/v1/archive/stats", { headers: getAuthHeader() });
  } catch (err) {
    console.error("Archive stats error:", err);
  }
}

async function checkAndLoadArchiveModerationQueue() {
  const section = document.getElementById("archiveModerationSection");
  const list = document.getElementById("archivePendingList");
  const badge = document.getElementById("archivePendingBadge");

  try {
    const res = await fetch("/api/v1/archive/moderation/queue", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    badge.innerText = `${result.data.length} Pending`;

    list.innerHTML = result.data
      .map(
        (item) => `
        <div style="background: white; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong>${item.title}</strong> (${item.fileName})
            <div style="font-size: 0.8rem; color: var(--neutral-600);">
              Course: ${item.courseOffering.course.code} | Type: ${item.resourceType}${item.assessmentType ? ` [${item.assessmentType}]` : ""} | Year: ${item.examYear || "N/A"} | Uploader: ${item.uploader.fullName}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-success btn-sm" onclick="openModerateArchiveModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'APPROVE')">
              ✅ Review & Approve
            </button>
            <button class="btn btn-danger btn-sm" onclick="openModerateArchiveModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'REJECT')">
              ❌ Reject
            </button>
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    section.classList.add("hidden");
  }
}

async function loadArchive() {
  const container = document.getElementById("archiveList");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading academic archive...</div>';

  checkAndLoadArchiveModerationQueue();

  const search = document.getElementById("archiveSearchInput")?.value.trim() || "";
  const assessmentType = document.getElementById("archiveAssessmentFilter")?.value || "";
  const examYear = document.getElementById("archiveYearFilter")?.value || "";
  const isOfficial = document.getElementById("archiveOfficialFilter")?.value || "";
  const courseOfferingId = document.getElementById("archiveOfferingFilter")?.value || "";
  const sortBy = document.getElementById("archiveSortBy")?.value || "newest";

  const params = new URLSearchParams();
  if (activeArchiveType) params.append("resourceType", activeArchiveType);
  if (assessmentType) params.append("assessmentType", assessmentType);
  if (examYear) params.append("examYear", examYear);
  if (isOfficial) params.append("isOfficial", isOfficial);
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (sortBy) params.append("sortBy", sortBy);
  if (search) params.append("search", search);

  try {
    const res = await fetch(`/api/v1/archive?${params.toString()}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data.resources || result.data.resources.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏛️</div>
          <h3>No Academic Archive Materials Found</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">
            ${search ? `No results matching "${search}".` : "Be the first to contribute past exams, solutions, or project archives."}
          </p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="document.getElementById('openUploadArchiveBtn').click()">
            ➕ Contribute Past Paper or Project
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.resources.map(renderArchiveCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderArchiveCard(a) {
  const sizeMb = (a.fileSize / (1024 * 1024)).toFixed(2);
  const sizeKb = Math.round(a.fileSize / 1024);
  const sizeStr = a.fileSize >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const isPending = a.status === "PENDING";
  const isRejected = a.status === "REJECTED";

  const officialBadge = a.isOfficial
    ? '<span class="badge" style="background: #fef08a; color: #854d0e; font-weight: 700;">⭐ Official Solution</span>'
    : '<span class="badge" style="background: #f1f5f9; color: #475569;">👤 Student Reference</span>';

  const typeIcon = a.resourceType === "PAST_EXAM" ? "📝" : a.resourceType === "PROJECT" ? "💻" : a.resourceType === "SOLUTION" ? "💡" : "📚";

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${a.courseOffering?.course?.code || "COURSE"} — ${a.courseOffering?.course?.title || "Course"}</div>
          <h3 class="card-title">${typeIcon} ${a.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          ${officialBadge}
          ${a.examYear ? `<span class="badge" style="background: #e2e8f0; color: #1e293b;">📅 ${a.examYear}</span>` : ""}
          ${a.assessmentType ? `<span class="badge" style="background: #ede9fe; color: #5b21b6;">${a.assessmentType}</span>` : ""}
          ${isPending ? '<span class="badge badge-late">⏳ Pending Review</span>' : ""}
          ${isRejected ? '<span class="badge badge-overdue">❌ Rejected</span>' : ""}
        </div>
      </div>

      ${a.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${a.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>💾 <strong>File:</strong> ${a.fileName} (${sizeStr})</div>
        <div>👤 <strong>Uploaded By:</strong> ${a.uploader?.fullName || "Contributor"}</div>
        <div>📥 <strong>Downloads:</strong> ${a.downloads}</div>
        <div>🗓️ <strong>Academic Year:</strong> ${a.academicYearStr || "N/A"} (Semester ${a.semesterNum || 1})</div>
      </div>

      ${a.tags ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--accent);">🏷️ Tags: ${a.tags}</div>` : ""}

      <div class="card-footer">
        <div>
          ${a.moderationNote ? `<span style="font-size: 0.8rem; color: #b45309;">Note: ${a.moderationNote}</span>` : ""}
        </div>
        <div>
          <a href="/api/v1/archive/${a.id}/download" class="btn btn-primary btn-sm" download target="_blank">
            📥 Download Archive File
          </a>
        </div>
      </div>
    </div>
  `;
}

function openModerateArchiveModal(resourceId, title, defaultAction) {
  document.getElementById("modArchiveId").value = resourceId;
  document.getElementById("modArchiveDecision").value = defaultAction;
  document.getElementById("modArchiveDetails").innerHTML = `
    <p><strong>Reviewing Archive Submission:</strong> ${title}</p>
  `;
  document.getElementById("moderateArchiveModal").classList.remove("hidden");
}

document.getElementById("moderateArchiveForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const resourceId = document.getElementById("modArchiveId").value;
  const action = document.getElementById("modArchiveDecision").value;
  const isOfficial = document.getElementById("modArchiveIsOfficial").checked;
  const note = document.getElementById("modArchiveNote").value;

  try {
    const res = await fetch(`/api/v1/archive/${resourceId}/moderate`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, isOfficial }),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    alert(`✅ Archive resource ${action.toLowerCase()}d successfully!`);
    closeModal("moderateArchiveModal");
    loadArchive();
    loadArchiveStats();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("openUploadArchiveBtn")?.addEventListener("click", () => {
  loadArchiveOfferings();
  document.getElementById("uploadArchiveModal").classList.remove("hidden");
});

document.getElementById("uploadArchiveForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("arcFileInput");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please select a past exam, project, or solution file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("title", document.getElementById("arcTitle").value.trim());
  formData.append("description", document.getElementById("arcDescription").value.trim());
  formData.append("resourceType", document.getElementById("arcResourceTypeSelect").value);
  formData.append("assessmentType", document.getElementById("arcAssessmentTypeSelect").value);
  formData.append("courseOfferingId", document.getElementById("arcCourseOfferingSelect").value);
  const examYear = document.getElementById("arcExamYear").value;
  if (examYear) formData.append("examYear", examYear);
  formData.append("isOfficial", document.getElementById("arcIsOfficial").checked);
  formData.append("tags", document.getElementById("arcTags").value.trim());
  formData.append("file", fileInput.files[0]);

  const submitBtn = document.getElementById("uploadArchiveSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Uploading & Archiving...";

  try {
    const res = await fetch("/api/v1/archive", {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Archive Error: ${result.error}`);
    } else {
      const isApproved = result.data.status === "APPROVED";
      alert(isApproved ? "✅ Archived resource published directly!" : "ℹ️ Resource submitted for faculty review!");
      closeModal("uploadArchiveModal");
      document.getElementById("uploadArchiveForm").reset();
      loadArchive();
      loadArchiveStats();
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "🚀 Submit to Archive";
  }
});

document.getElementById("archiveAssessmentFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveYearFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveOfficialFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveOfferingFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveSortBy")?.addEventListener("change", loadArchive);
document.getElementById("refreshArchiveBtn")?.addEventListener("click", () => {
  loadArchive();
  loadArchiveStats();
});
document.getElementById("archiveSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") loadArchive();
});

// ----------------------------------------------------
// 7. PRACTICE QUESTIONS & QUIZZES (PHASE 6)
// ----------------------------------------------------
let activeQuizSubView = "quizzes";
let activeQuizData = null;
let activeQuizQuestionIndex = 0;
let activeQuizAnswers = {};
let quizTimerInterval = null;

// Sub-view toggle
document.querySelectorAll(".quiz-view-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".quiz-view-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");

    activeQuizSubView = pill.dataset.view;
    if (activeQuizSubView === "quizzes") {
      document.getElementById("quizzesContainer").classList.remove("hidden");
      document.getElementById("practiceContainer").classList.add("hidden");
      document.getElementById("practiceFilterGroup").style.display = "none";
      loadQuizzes();
    } else {
      document.getElementById("quizzesContainer").classList.add("hidden");
      document.getElementById("practiceContainer").classList.remove("hidden");
      document.getElementById("practiceFilterGroup").style.display = "block";
      loadPracticeQuestions();
    }
  });
});

async function loadQuizzesOfferings() {
  const selectFilter = document.getElementById("quizzesOfferingFilter");
  const selectQ = document.getElementById("qCourseOfferingSelect");
  const selectQuiz = document.getElementById("quizCourseOfferingSelect");

  try {
    const res = await fetch("/api/v1/academic/my-courses", { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());
    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Enrolled Courses</option>' + optionsHtml;
    }
    if (selectQ) {
      selectQ.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
    if (selectQuiz) {
      selectQuiz.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load quiz course offerings:", err);
  }
}

async function loadQuizzes() {
  const container = document.getElementById("quizzesContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading course quizzes...</div>';

  const courseOfferingId = document.getElementById("quizzesOfferingFilter")?.value || "";
  const params = new URLSearchParams();
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);

  try {
    const res = await fetch(`/api/v1/quizzes?${params.toString()}`, { headers: getAuthHeader() });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎯</div>
          <h3>No Quizzes Available</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">There are no active quizzes published for your enrolled courses right now.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.map(renderQuizCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderQuizCard(q) {
  const isInstructor = currentUser && (currentUser.globalRoles?.includes("ADMIN") || currentUser.role === "INSTRUCTOR");
  const attemptsLeft = Math.max(0, q.maxAttempts - q.userAttemptsCount);
  const bestScoreBadge = q.bestScore !== null
    ? `<span class="badge" style="background: ${q.hasPassed ? "#dcfce7" : "#fee2e2"}; color: ${q.hasPassed ? "#15803d" : "#b91c1c"}; font-weight: 700;">Best: ${Math.round(q.bestScore)}% (${q.hasPassed ? "Passed" : "Not Passed"})</span>`
    : "";

  const publishBadge = q.isPublished
    ? '<span class="badge badge-submitted">✅ Published</span>'
    : '<span class="badge" style="background: #e2e8f0; color: #475569;">Draft</span>';

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${q.course?.code || "COURSE"} — ${q.course?.title || "Course"}</div>
          <h3 class="card-title">🎯 ${q.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          ${publishBadge}
          ${bestScoreBadge}
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">⏱️ ${q.durationMin} mins</span>
          <span class="badge" style="background: #f1f5f9; color: #334155;">❓ ${q.questionCount} Questions</span>
        </div>
      </div>

      ${q.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${q.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>🎯 <strong>Passing Score:</strong> ${q.passingScore}%</div>
        <div>🔄 <strong>Attempts Used:</strong> ${q.userAttemptsCount} of ${q.maxAttempts}</div>
        <div>🏆 <strong>Total Points:</strong> ${q.totalPoints}</div>
      </div>

      <div class="card-footer" style="margin-top: 1rem;">
        <div style="display: flex; gap: 0.5rem;">
          ${isInstructor ? `
            <button class="btn btn-sm btn-secondary" onclick="openQuizAnalytics('${q.id}')">📊 Cohort Analytics</button>
            <button class="btn btn-sm btn-secondary" onclick="toggleQuizPublish('${q.id}', ${!q.isPublished})">${q.isPublished ? "Unpublish" : "Publish"}</button>
          ` : ""}
        </div>
        <div>
          ${attemptsLeft > 0 || q.hasActiveAttempt ? `
            <button class="btn btn-primary btn-sm" onclick="startQuizRunner('${q.id}')">
              ${q.hasActiveAttempt ? "▶️ Resume Active Quiz" : "🚀 Start Quiz Attempt"}
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm" disabled>Max Attempts Reached</button>
          `}
        </div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// TIMED QUIZ RUNNER ENGINE
// ----------------------------------------------------
async function startQuizRunner(quizId) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}/attempts/start`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    activeQuizData = result.data;
    activeQuizQuestionIndex = 0;
    activeQuizAnswers = {};

    // Restore any previously saved draft answers
    if (activeQuizData.savedAnswers) {
      activeQuizData.savedAnswers.forEach((sa) => {
        activeQuizAnswers[sa.questionId] = {
          selectedOptionId: sa.selectedOptionId,
          textResponse: sa.textResponse,
        };
      });
    }

    document.getElementById("runnerQuizTitle").innerText = "Timed Quiz";
    document.getElementById("runnerQuizInfo").innerText = `Attempt #${activeQuizData.attemptNum} | Time remaining`;

    document.getElementById("takeQuizModal").classList.remove("hidden");

    startQuizTimer(activeQuizData.timeRemainingSeconds);
    renderQuizRunnerQuestion(0);
  } catch (err) {
    alert(`Could not start quiz: ${err.message}`);
  }
}

function startQuizTimer(secondsLeft) {
  if (quizTimerInterval) clearInterval(quizTimerInterval);

  let remaining = secondsLeft;
  const display = document.getElementById("quizCountdown");

  function update() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    display.innerText = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    if (remaining <= 60) {
      document.getElementById("quizTimerBadge").style.background = "#fee2e2";
      document.getElementById("quizTimerBadge").style.color = "#b91c1c";
    }

    if (remaining <= 0) {
      clearInterval(quizTimerInterval);
      alert("⏱️ Time has expired! Your quiz attempt is being submitted automatically.");
      submitActiveQuiz();
    }
    remaining--;
  }

  update();
  quizTimerInterval = setInterval(update, 1000);
}

function renderQuizRunnerQuestion(index) {
  const container = document.getElementById("quizRunnerBody");
  const questions = activeQuizData.questions;

  if (index < 0 || index >= questions.length) return;
  activeQuizQuestionIndex = index;

  const q = questions[index];
  const userAns = activeQuizAnswers[q.questionId] || {};

  document.getElementById("quizQuestionCounter").innerText = `Question ${index + 1} of ${questions.length}`;
  document.getElementById("quizPrevBtn").disabled = index === 0;
  document.getElementById("quizNextBtn").style.display = index === questions.length - 1 ? "none" : "inline-block";

  let optionsHtml = "";

  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
    optionsHtml = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
        ${q.options.map((opt, i) => `
          <label style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 0.75rem 1rem; cursor: pointer;">
            <input type="radio" name="runnerOption" value="${opt.id}" ${userAns.selectedOptionId === opt.id ? "checked" : ""} onchange="recordRunnerAnswer('${q.questionId}', '${opt.id}')" />
            <span style="font-weight: 500;">${String.fromCharCode(65 + i)}) ${opt.optionText}</span>
          </label>
        `).join("")}
      </div>
    `;
  } else {
    optionsHtml = `
      <div style="margin-top: 1rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Your Written Response:</label>
        <textarea id="runnerTextResponse" rows="4" style="width: 100%;" placeholder="Enter explanation or code..." oninput="recordRunnerTextAnswer('${q.questionId}', this.value)">${userAns.textResponse || ""}</textarea>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="badge" style="background: #e2e8f0; color: #334155;">${q.type.replace(/_/g, " ")}</span>
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--neutral-600);">${q.points} Points</span>
      </div>
      <h3 style="margin-top: 0.75rem; font-size: 1.15rem; line-height: 1.5;">${q.prompt}</h3>
    </div>
    ${optionsHtml}
  `;
}

function navigateQuizQuestion(step) {
  renderQuizRunnerQuestion(activeQuizQuestionIndex + step);
}

function recordRunnerAnswer(questionId, selectedOptionId) {
  if (!activeQuizAnswers[questionId]) activeQuizAnswers[questionId] = {};
  activeQuizAnswers[questionId].selectedOptionId = selectedOptionId;

  // Background save draft
  fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/draft`, {
    method: "POST",
    headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, selectedOptionId }),
  }).catch(() => {});
}

function recordRunnerTextAnswer(questionId, text) {
  if (!activeQuizAnswers[questionId]) activeQuizAnswers[questionId] = {};
  activeQuizAnswers[questionId].textResponse = text;

  // Background save draft
  fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/draft`, {
    method: "POST",
    headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, textResponse: text }),
  }).catch(() => {});
}

function confirmExitQuiz() {
  if (confirm("⚠️ Are you sure you want to exit? Your timer will continue running on the server until expiration.")) {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    closeModal("takeQuizModal");
  }
}

async function submitActiveQuiz() {
  if (quizTimerInterval) clearInterval(quizTimerInterval);

  const answersArray = Object.keys(activeQuizAnswers).map((qId) => ({
    questionId: qId,
    selectedOptionId: activeQuizAnswers[qId].selectedOptionId,
    textResponse: activeQuizAnswers[qId].textResponse,
  }));

  try {
    const res = await fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/submit`, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answersArray }),
    });
    const result = await res.json();

    closeModal("takeQuizModal");

    if (!result.success) return alert(result.error);

    const data = result.data;
    document.getElementById("quizResultScore").innerText = `${Math.round(data.score)}%`;
    document.getElementById("quizResultPoints").innerText = `${data.totalEarned} of ${data.totalPossible} points earned`;

    const icon = data.passed ? "🏆" : data.status === "NEEDS_GRADING" ? "📝" : "⚠️";
    document.getElementById("quizResultIcon").innerText = icon;
    document.getElementById("quizResultTitle").innerText = data.passed
      ? "Congratulations! You Passed!"
      : data.status === "NEEDS_GRADING"
      ? "Submitted for Faculty Grading"
      : "Quiz Completed";

    const badge = data.passed
      ? '<span class="badge badge-submitted">PASSED</span>'
      : data.status === "NEEDS_GRADING"
      ? '<span class="badge badge-late">PENDING MANUAL REVIEW</span>'
      : '<span class="badge badge-overdue">FAILED</span>';

    document.getElementById("quizResultBadgeContainer").innerHTML = badge;

    document.getElementById("openReviewFromResultBtn").onclick = () => {
      closeModal("quizResultModal");
      openQuizReview(data.attemptId);
    };

    document.getElementById("quizResultModal").classList.remove("hidden");
    loadQuizzes();
  } catch (err) {
    alert(`Submission error: ${err.message}`);
  }
}

// ----------------------------------------------------
// QUIZ REVIEW ENGINE
// ----------------------------------------------------
async function openQuizReview(attemptId) {
  try {
    const res = await fetch(`/api/v1/quizzes/attempts/${attemptId}/review`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const a = result.data;
    document.getElementById("reviewQuizTitle").innerText = `Review: ${a.quizTitle}`;
    document.getElementById("reviewScoreHeader").innerText = `Score: ${Math.round(a.score)}% | ${a.passed ? "Passed ✅" : "Not Passed ❌"}`;

    document.getElementById("quizReviewBody").innerHTML = a.questions.map((q, idx) => {
      const isCorrect = q.isCorrect;
      const statusIcon = isCorrect === true ? "✅" : isCorrect === false ? "❌" : "📝";

      let optionsReview = "";
      if (q.options && q.options.length > 0) {
        optionsReview = q.options.map((opt) => {
          const isChosen = q.selectedOptionId === opt.id;
          const isActualCorrect = opt.isCorrect;
          let border = "1px solid var(--neutral-200)";
          let bg = "#fff";

          if (isActualCorrect) {
            bg = "#dcfce7";
            border = "1px solid #86efac";
          } else if (isChosen && !isActualCorrect) {
            bg = "#fee2e2";
            border = "1px solid #fca5a5";
          }

          return `
            <div style="background: ${bg}; border: ${border}; border-radius: var(--radius); padding: 0.6rem 0.75rem; margin-top: 0.35rem; font-size: 0.9rem;">
              ${isActualCorrect ? "⭐ " : ""}${opt.optionText} ${isChosen ? "<strong>(Your Answer)</strong>" : ""}
            </div>
          `;
        }).join("");
      } else {
        optionsReview = `
          <div style="background: #f8fafc; padding: 0.75rem; border-radius: var(--radius); margin-top: 0.5rem; font-size: 0.9rem;">
            <strong>Your Response:</strong> ${q.textResponse || "<em>No response</em>"}
          </div>
        `;
      }

      return `
        <div style="border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-weight: 700;">Question ${idx + 1} (${q.pointsAwarded} / ${q.points} pts)</span>
            <span>${statusIcon}</span>
          </div>
          <p style="margin: 0; font-weight: 600;">${q.prompt}</p>
          ${optionsReview}
          ${q.explanation ? `<div style="margin-top: 0.75rem; font-size: 0.85rem; color: #4338ca; background: #eef2ff; padding: 0.5rem 0.75rem; border-radius: 4px;">💡 <strong>Explanation:</strong> ${q.explanation}</div>` : ""}
          ${q.graderFeedback ? `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #92400e; background: #fef3c7; padding: 0.5rem 0.75rem; border-radius: 4px;">👨‍🏫 <strong>Instructor Feedback:</strong> ${q.graderFeedback}</div>` : ""}
        </div>
      `;
    }).join("");

    document.getElementById("quizReviewModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// PRACTICE ARENA ENGINE
// ----------------------------------------------------
async function loadPracticeQuestions() {
  const container = document.getElementById("practiceContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading practice questions...</div>';

  const courseOfferingId = document.getElementById("quizzesOfferingFilter")?.value || "";
  const difficulty = document.getElementById("practiceDifficultyFilter")?.value || "";
  const search = document.getElementById("quizzesSearchInput")?.value.trim() || "";

  const params = new URLSearchParams();
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (difficulty) params.append("difficulty", difficulty);
  if (search) params.append("search", search);

  try {
    const res = await fetch(`/api/v1/quizzes/questions?${params.toString()}`, { headers: getAuthHeader() });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">💡</div>
          <h3>No Practice Questions Found</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">No questions match your current filter. Try selecting another course or difficulty.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.map(renderPracticeCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderPracticeCard(q) {
  return `
    <div class="assignment-card" style="margin-bottom: 1rem;" id="pracCard_${q.id}">
      <div class="card-header">
        <div>
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">${q.difficulty}</span>
          ${q.topic ? `<span class="badge" style="background: #f1f5f9; color: #334155;">🏷️ ${q.topic}</span>` : ""}
          <h3 class="card-title" style="margin-top: 0.5rem;">${q.prompt}</h3>
        </div>
      </div>

      <div style="margin: 1rem 0;">
        ${q.options && q.options.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${q.options.map((opt, i) => `
              <label style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 0.6rem 0.75rem; cursor: pointer;">
                <input type="radio" name="practiceOpt_${q.id}" value="${opt.id}" />
                <span>${String.fromCharCode(65 + i)}) ${opt.optionText}</span>
              </label>
            `).join("")}
          </div>
        ` : `
          <textarea id="pracText_${q.id}" rows="2" style="width: 100%;" placeholder="Enter your answer..."></textarea>
        `}
      </div>

      <div id="pracFeedback_${q.id}" class="hidden" style="margin-bottom: 0.75rem; padding: 0.75rem; border-radius: var(--radius);"></div>

      <div class="card-footer">
        <div></div>
        <button class="btn btn-primary btn-sm" onclick="checkPracticeAnswer('${q.id}')">
          💡 Check Answer & Explanation
        </button>
      </div>
    </div>
  `;
}

async function checkPracticeAnswer(questionId) {
  const selectedOpt = document.querySelector(`input[name="practiceOpt_${questionId}"]:checked`);
  const textInput = document.getElementById(`pracText_${questionId}`);

  const selectedOptionId = selectedOpt ? selectedOpt.value : undefined;
  const textResponse = textInput ? textInput.value : undefined;

  try {
    const res = await fetch(`/api/v1/quizzes/questions/${questionId}/practice`, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ selectedOptionId, textResponse }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const fb = document.getElementById(`pracFeedback_${questionId}`);
    fb.classList.remove("hidden");

    if (result.data.isCorrect) {
      fb.style.background = "#dcfce7";
      fb.style.border = "1px solid #86efac";
      fb.style.color = "#15803d";
      fb.innerHTML = `<strong>✅ Correct Answer!</strong><br>${result.data.explanation}`;
    } else {
      fb.style.background = "#fee2e2";
      fb.style.border = "1px solid #fca5a5";
      fb.style.color = "#b91c1c";
      fb.innerHTML = `<strong>❌ Incorrect.</strong><br>${result.data.explanation}`;
    }
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// INSTRUCTOR QUIZ & QUESTION BUILDER
// ----------------------------------------------------
let optionRowCount = 0;

function addOptionRow(text = "", isCorrect = false) {
  const container = document.getElementById("optionsList");
  const rowId = `optRow_${optionRowCount++}`;

  const row = document.createElement("div");
  row.id = rowId;
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "0.75rem";
  row.style.marginBottom = "0.5rem";

  row.innerHTML = `
    <input type="radio" name="correctOptionRadio" value="${rowId}" ${isCorrect ? "checked" : ""} title="Mark as correct answer" />
    <input type="text" class="opt-text-input" value="${text}" required style="flex: 1;" placeholder="Option text..." />
    <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('${rowId}').remove()">&times;</button>
  `;
  container.appendChild(row);
}

document.getElementById("openCreateQuestionModalBtn")?.addEventListener("click", () => {
  loadQuizzesOfferings();
  const list = document.getElementById("optionsList");
  list.innerHTML = "";
  optionRowCount = 0;
  addOptionRow("Option 1", true);
  addOptionRow("Option 2", false);
  document.getElementById("createQuestionModal").classList.remove("hidden");
});

document.getElementById("createQuestionForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const courseOfferingId = document.getElementById("qCourseOfferingSelect").value;
  const type = document.getElementById("qTypeSelect").value;
  const difficulty = document.getElementById("qDifficultySelect").value;
  const chapter = document.getElementById("qChapter").value.trim();
  const topic = document.getElementById("qTopic").value.trim();
  const prompt = document.getElementById("qPrompt").value.trim();
  const explanation = document.getElementById("qExplanation").value.trim();

  let options = [];
  if (type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE") {
    const selectedRadio = document.querySelector('input[name="correctOptionRadio"]:checked');
    if (!selectedRadio) {
      alert("Please select which option is correct by clicking the radio button.");
      return;
    }

    const rows = document.querySelectorAll("#optionsList > div");
    rows.forEach((row) => {
      const textInput = row.querySelector(".opt-text-input");
      const isCorrect = row.querySelector('input[type="radio"]').checked;
      if (textInput && textInput.value.trim()) {
        options.push({ optionText: textInput.value.trim(), isCorrect });
      }
    });

    if (options.length < 2) {
      alert("Please provide at least 2 options.");
      return;
    }
  }

  try {
    const res = await fetch("/api/v1/quizzes/questions", {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ courseOfferingId, type, difficulty, chapter, topic, prompt, explanation, options }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert("✅ Practice question created successfully!");
    closeModal("createQuestionModal");
    document.getElementById("createQuestionForm").reset();
    if (activeQuizSubView === "practice") loadPracticeQuestions();
  } catch (err) {
    alert(err.message);
  }
});

// Quiz Creator Modal Handler
document.getElementById("openCreateQuizModalBtn")?.addEventListener("click", () => {
  loadQuizzesOfferings();
  document.getElementById("createQuizModal").classList.remove("hidden");
});

document.getElementById("quizCourseOfferingSelect")?.addEventListener("change", async (e) => {
  const offeringId = e.target.value;
  const picker = document.getElementById("quizQuestionPickerList");
  if (!offeringId) {
    picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">Select course offering to load questions from bank.</p>';
    return;
  }

  picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">Loading questions...</p>';

  try {
    const res = await fetch(`/api/v1/quizzes/questions?courseOfferingId=${offeringId}`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">No questions found in bank for this course. Add questions first.</p>';
      return;
    }

    picker.innerHTML = result.data.map((q) => `
      <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid var(--neutral-100); font-size: 0.85rem; cursor: pointer;">
        <input type="checkbox" class="quiz-q-checkbox" value="${q.id}" checked />
        <span>[${q.difficulty}] ${q.prompt.slice(0, 65)}...</span>
      </label>
    `).join("");
  } catch (err) {
    picker.innerHTML = `<p style="color: var(--danger); font-size: 0.85rem;">${err.message}</p>`;
  }
});

document.getElementById("createQuizForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("quizTitleInput").value.trim();
  const courseOfferingId = document.getElementById("quizCourseOfferingSelect").value;
  const description = document.getElementById("quizDescInput").value.trim();
  const durationMin = parseInt(document.getElementById("quizDurationInput").value, 10);
  const passingScore = parseFloat(document.getElementById("quizPassingScoreInput").value);
  const maxAttempts = parseInt(document.getElementById("quizMaxAttemptsInput").value, 10);
  const shuffleQuestions = document.getElementById("quizShuffleQ").checked;
  const shuffleOptions = document.getElementById("quizShuffleOpt").checked;

  const checkedQuestions = Array.from(document.querySelectorAll(".quiz-q-checkbox:checked")).map((cb) => cb.value);

  try {
    const res = await fetch("/api/v1/quizzes", {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        courseOfferingId,
        description,
        durationMin,
        passingScore,
        maxAttempts,
        shuffleQuestions,
        shuffleOptions,
      }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const quizId = result.data.id;

    // Attach selected questions
    for (let i = 0; i < checkedQuestions.length; i++) {
      await fetch(`/api/v1/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: checkedQuestions[i], points: 1.0, orderIndex: i }),
      });
    }

    alert("✅ Quiz created successfully with selected questions!");
    closeModal("createQuizModal");
    document.getElementById("createQuizForm").reset();
    loadQuizzes();
  } catch (err) {
    alert(err.message);
  }
});

async function toggleQuizPublish(quizId, shouldPublish) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: shouldPublish }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert(`Quiz status updated to: ${shouldPublish ? "Published" : "Draft"}`);
    loadQuizzes();
  } catch (err) {
    alert(err.message);
  }
}

async function openQuizAnalytics(quizId) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}/stats`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const s = result.data;
    document.getElementById("analyticsQuizTitle").innerText = `Analytics: ${s.title} (${s.course.code})`;

    document.getElementById("quizAnalyticsBody").innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; text-align: center;">
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700;">${s.totalAttempts}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Total Attempts</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700;">${s.uniqueStudents}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Students</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #16a34a;">${s.passRate}%</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Pass Rate</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #4f46e5;">${s.avgScore}%</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Average Score</div>
        </div>
      </div>

      <h4 style="margin-bottom: 0.75rem;">Student Attempt History:</h4>
      ${s.attempts.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Attempt</th>
              <th>Score</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${s.attempts.map((att) => `
              <tr>
                <td><strong>${att.student.fullName}</strong> (${att.student.campusId || "Student"})</td>
                <td>#${att.attemptNum}</td>
                <td>${Math.round(att.score)}%</td>
                <td><span class="badge ${att.passed ? "badge-submitted" : "badge-overdue"}">${att.passed ? "PASSED" : "FAILED"}</span></td>
                <td>${new Date(att.submittedAt).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<p style="color: var(--neutral-600);">No student attempts recorded yet.</p>`}
    `;

    document.getElementById("quizAnalyticsModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

// Filter listeners
document.getElementById("quizzesOfferingFilter")?.addEventListener("change", () => {
  if (activeQuizSubView === "quizzes") loadQuizzes();
  else loadPracticeQuestions();
});
document.getElementById("practiceDifficultyFilter")?.addEventListener("change", loadPracticeQuestions);
document.getElementById("refreshQuizzesBtn")?.addEventListener("click", () => {
  if (activeQuizSubView === "quizzes") loadQuizzes();
  else loadPracticeQuestions();
});
document.getElementById("quizzesSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    if (activeQuizSubView === "quizzes") loadQuizzes();
    else loadPracticeQuestions();
  }
});

// ====================================================
// PHASE 7: COMMUNITY & STUDENT BLOG SYSTEM
// ====================================================

let currentBlogCategory = "";
let currentBlogSearch = "";
let currentBlogSort = "recent";
let showingMyPosts = false;
let showingBookmarks = false;
let activeReadingPostId = null;

// Category pill filters
document.querySelectorAll(".blog-cat-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".blog-cat-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");

    currentBlogCategory = pill.dataset.category || "";
    showingMyPosts = false;
    showingBookmarks = false;
    loadBlogPosts();
  });
});

// Blog Filter Listeners
document.getElementById("blogSortSelect")?.addEventListener("change", (e) => {
  currentBlogSort = e.target.value;
  loadBlogPosts();
});

document.getElementById("refreshBlogBtn")?.addEventListener("click", () => {
  loadBlogPosts();
});

document.getElementById("blogSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    currentBlogSearch = e.target.value.trim();
    loadBlogPosts();
  }
});

// Action buttons
document.getElementById("viewBookmarksBtn")?.addEventListener("click", () => {
  showingBookmarks = true;
  showingMyPosts = false;
  loadBlogPosts();
});

document.getElementById("viewMyPostsBtn")?.addEventListener("click", () => {
  showingMyPosts = true;
  showingBookmarks = false;
  loadBlogPosts();
});

document.getElementById("openCreatePostModalBtn")?.addEventListener("click", () => {
  document.getElementById("createPostForm").reset();
  document.getElementById("postCoverUrl").value = "";
  document.getElementById("coverUploadStatus").innerText = "";
  document.getElementById("postPreviewBox").classList.add("hidden");
  document.getElementById("createPostModal").classList.remove("hidden");
});

// Toggle Markdown Preview
document.getElementById("togglePostPreviewBtn")?.addEventListener("click", () => {
  const previewBox = document.getElementById("postPreviewBox");
  const content = document.getElementById("postContentInput").value;
  if (previewBox.classList.contains("hidden")) {
    previewBox.innerHTML = renderMarkdown(content);
    previewBox.classList.remove("hidden");
  } else {
    previewBox.classList.add("hidden");
  }
});

// Simple client-side Markdown formatter
function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.*$)/gim, '<h3 style="margin-top:1rem;margin-bottom:0.5rem;font-size:1.15rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="margin-top:1.25rem;margin-bottom:0.5rem;font-size:1.35rem;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="margin-top:1.5rem;margin-bottom:0.75rem;font-size:1.6rem;">$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/gim, '<pre style="background:#1e293b;color:#f8fafc;padding:0.75rem;border-radius:var(--radius);overflow-x:auto;margin:0.75rem 0;"><code>$1</code></pre>')
    .replace(/`([^`]+)`/gim, '<code style="background:#f1f5f9;padding:0.15rem 0.35rem;border-radius:4px;color:#0f172a;">$1</code>')
    .replace(/\n$/gim, '<br />');
  return html.split("\n\n").map(p => `<p style="margin-bottom:0.85rem;">${p}</p>`).join("");
}

// Cover image file upload handler
document.getElementById("postCoverFileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const status = document.getElementById("coverUploadStatus");
  status.innerText = "Uploading cover...";

  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch("/api/v1/blog/upload-cover", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: formData,
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById("postCoverUrl").value = result.data.fileUrl;
      status.innerText = "✅ Uploaded!";
    } else {
      status.innerText = `❌ ${result.error || "Upload failed"}`;
    }
  } catch (err) {
    status.innerText = `❌ ${err.message}`;
  }
});

// Create Post Form Submission
document.getElementById("createPostForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("postTitleInput").value.trim();
  const category = document.getElementById("postCategorySelect").value;
  const tags = document.getElementById("postTagsInput").value.trim();
  const coverImage = document.getElementById("postCoverUrl").value.trim();
  const content = document.getElementById("postContentInput").value.trim();

  try {
    const res = await fetch("/api/v1/blog/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ title, category, tags, coverImage, content }),
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Article submitted! If you are a student, it will appear publicly once approved by an administrator.");
      closeModal("createPostModal");
      loadBlogPosts();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

// Load Blog Posts
async function loadBlogPosts() {
  const container = document.getElementById("blogPostsContainer");
  container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--neutral-600); grid-column: 1 / -1;">Loading articles...</div>`;

  try {
    let url = "/api/v1/blog/posts";
    if (showingBookmarks) {
      url = "/api/v1/blog/bookmarks";
    } else {
      const params = new URLSearchParams();
      if (currentBlogCategory) params.append("category", currentBlogCategory);
      if (currentBlogSearch) params.append("search", currentBlogSearch);
      if (currentBlogSort) params.append("sort", currentBlogSort);
      if (showingMyPosts) params.append("myPosts", "true");
      url += `?${params.toString()}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="color: var(--danger); text-align: center; grid-column: 1 / -1;">Failed to load: ${result.error}</div>`;
      return;
    }

    const posts = showingBookmarks ? result.data.map(b => b.post) : result.data;

    if (!posts || posts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--neutral-600); grid-column: 1 / -1; background: #fff; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <p style="font-size: 2rem; margin-bottom: 0.5rem;">📝</p>
          <h3>No articles found</h3>
          <p style="margin-top: 0.25rem;">${showingBookmarks ? "You have not bookmarked any articles yet." : "Be the first to share an article with your classmates!"}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = posts.map((post) => `
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; border-top: 4px solid var(--primary); transition: transform 0.15s ease, box-shadow 0.15s ease;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
        ${post.coverImage ? `
          <div style="height: 150px; overflow: hidden; background: #e2e8f0; margin: -1.25rem -1.25rem 1rem -1.25rem;">
            <img src="${post.coverImage}" alt="Cover" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />
          </div>
        ` : ""}
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span class="badge" style="background: #e0e7ff; color: #4338ca; font-size: 0.75rem;">${post.category}</span>
            ${post.status && post.status !== "APPROVED" ? `
              <span class="badge ${post.status === "PENDING" ? "badge-upcoming" : "badge-overdue"}">${post.status}</span>
            ` : ""}
          </div>
          <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem; line-height: 1.35; cursor: pointer;" onclick="openPostDetail('${post.slug || post.id}')">${post.title}</h3>
          <p style="color: var(--neutral-600); font-size: 0.85rem; line-height: 1.5; margin-bottom: 1rem;">${post.content || ""}</p>
        </div>

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid var(--neutral-200); font-size: 0.8rem; color: var(--neutral-600);">
            <span style="font-weight: 600; cursor: pointer; color: var(--primary);" onclick="openAuthorProfile('${post.author.id}')">👤 ${post.author.fullName}</span>
            <span>👁️ ${post.views} | ❤️ ${post.likesCount} | 💬 ${post.commentsCount}</span>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <button class="btn btn-primary btn-sm" style="flex: 1; justify-content: center;" onclick="openPostDetail('${post.slug || post.id}')">📖 Read</button>
            <button class="btn btn-secondary btn-sm" onclick="toggleBookmarkPost('${post.id}')">${post.isBookmarked ? "⭐ Saved" : "☆ Save"}</button>
          </div>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; grid-column: 1 / -1;">Error: ${err.message}</div>`;
  }
}

// Open and Read Post Detail
async function openPostDetail(slugOrId) {
  try {
    const res = await fetch(`/api/v1/blog/posts/${slugOrId}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (!result.success) {
      alert(`Could not load article: ${result.error}`);
      return;
    }

    const post = result.data;
    activeReadingPostId = post.id;

    document.getElementById("articleCategoryBadge").innerText = post.category;
    document.getElementById("articleTitle").innerText = post.title;
    document.getElementById("articleAuthorName").innerText = `${post.author.fullName} (${post.author.campusId || "Student"})`;
    document.getElementById("articleAuthorName").onclick = () => openAuthorProfile(post.author.id);
    document.getElementById("authorAvatarLetter").innerText = post.author.fullName[0].toUpperCase();
    document.getElementById("articleMetaDate").innerText = `Published ${new Date(post.createdAt).toLocaleDateString()} • 👁️ ${post.views} views`;

    const coverContainer = document.getElementById("articleCoverContainer");
    const coverImg = document.getElementById("articleCoverImg");
    if (post.coverImage) {
      coverImg.src = post.coverImage;
      coverContainer.style.display = "block";
    } else {
      coverContainer.style.display = "none";
    }

    document.getElementById("articleContentBody").innerHTML = renderMarkdown(post.content);

    // Like and Bookmark buttons
    const likeBtn = document.getElementById("likeArticleBtn");
    likeBtn.innerHTML = `${post.isLiked ? "❤️" : "🤍"} <span id="articleLikeCount">${post.likesCount}</span>`;
    likeBtn.onclick = () => toggleLikePost(post.id);

    const bookmarkBtn = document.getElementById("bookmarkArticleBtn");
    bookmarkBtn.innerHTML = `${post.isBookmarked ? "⭐ Saved" : "☆ Save"}`;
    bookmarkBtn.onclick = () => toggleBookmarkPost(post.id);

    // Share button
    document.getElementById("shareArticleBtn").onclick = () => {
      const shareUrl = `${window.location.origin}/#blog/${post.slug}`;
      navigator.clipboard?.writeText(shareUrl);
      alert(`🔗 Article link copied to clipboard:\n${shareUrl}`);
    };

    // Report button
    document.getElementById("reportArticleBtn").onclick = () => {
      openReportModal("POST", post.id);
    };

    // Tags list
    const tagsContainer = document.getElementById("articleTagsList");
    tagsContainer.innerHTML = post.tags.map((t) => `<span class="badge" style="background:#f1f5f9;color:#334155;">#${t}</span>`).join("");

    // Comments
    renderComments(post.comments || []);

    document.getElementById("viewPostModal").classList.remove("hidden");
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Render comments thread
function renderComments(comments) {
  document.getElementById("articleCommentsCount").innerText = comments.length;
  const list = document.getElementById("articleCommentsList");

  if (!comments || comments.length === 0) {
    list.innerHTML = `<p style="color: var(--neutral-600); font-size: 0.9rem;">No comments yet. Start the conversation!</p>`;
    return;
  }

  list.innerHTML = comments.map((c) => `
    <div style="background: #f8fafc; padding: 0.85rem 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; font-size: 0.8rem;">
        <span style="font-weight: 700; color: var(--primary);">👤 ${c.user.fullName} (${c.user.campusId || "Student"})</span>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span style="color: var(--neutral-600);">${new Date(c.createdAt).toLocaleDateString()}</span>
          <button class="btn btn-sm btn-danger" style="padding: 0.1rem 0.4rem; font-size: 0.7rem;" onclick="deleteComment('${c.id}')">🗑️</button>
          <button class="btn btn-sm btn-secondary" style="padding: 0.1rem 0.4rem; font-size: 0.7rem;" onclick="openReportModal('COMMENT', '${c.id}')">🚩</button>
        </div>
      </div>
      <p style="font-size: 0.9rem; line-height: 1.5; color: var(--neutral-800);">${c.content}</p>
    </div>
  `).join("");
}

// Add Comment Form Submission
document.getElementById("addCommentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeReadingPostId) return;

  const content = document.getElementById("commentInput").value.trim();
  if (!content) return;

  try {
    const res = await fetch(`/api/v1/blog/posts/${activeReadingPostId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ content }),
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById("commentInput").value = "";
      openPostDetail(activeReadingPostId);
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

// Delete Comment
async function deleteComment(commentId) {
  if (!confirm("Are you sure you want to delete this comment?")) return;
  try {
    const res = await fetch(`/api/v1/blog/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success) {
      if (activeReadingPostId) openPostDetail(activeReadingPostId);
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Toggle Like
async function toggleLikePost(postId) {
  try {
    const res = await fetch(`/api/v1/blog/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success) {
      if (activeReadingPostId === postId) {
        const likeBtn = document.getElementById("likeArticleBtn");
        likeBtn.innerHTML = `${result.data.liked ? "❤️" : "🤍"} <span id="articleLikeCount">${result.data.likesCount}</span>`;
      }
      loadBlogPosts();
    }
  } catch (err) {
    console.error("Like toggle failed:", err.message);
  }
}

// Toggle Bookmark
async function toggleBookmarkPost(postId) {
  try {
    const res = await fetch(`/api/v1/blog/posts/${postId}/bookmark`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success) {
      if (activeReadingPostId === postId) {
        const bookmarkBtn = document.getElementById("bookmarkArticleBtn");
        bookmarkBtn.innerHTML = `${result.data.bookmarked ? "⭐ Saved" : "☆ Save"}`;
      }
      loadBlogPosts();
    }
  } catch (err) {
    console.error("Bookmark toggle failed:", err.message);
  }
}

// Author Profile Modal
async function openAuthorProfile(authorId) {
  try {
    const res = await fetch(`/api/v1/blog/authors/${authorId}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (!result.success) {
      alert(`Could not load author profile: ${result.error}`);
      return;
    }

    const { author, stats, posts } = result.data;
    document.getElementById("authorProfileHeader").innerHTML = `
      <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary); color: #fff; margin: 0 auto 0.75rem auto; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700;">
        ${author.fullName[0].toUpperCase()}
      </div>
      <h3 style="margin-bottom: 0.25rem;">${author.fullName}</h3>
      <p style="color: var(--neutral-600); font-size: 0.85rem; margin-bottom: 1rem;">Campus ID: ${author.campusId || "Student"} • Member since ${new Date(author.createdAt).toLocaleDateString()}</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; max-width: 400px; margin: 0 auto;">
        <div style="background: #f1f5f9; padding: 0.75rem; border-radius: var(--radius);">
          <div style="font-weight: 700; font-size: 1.25rem;">${stats.totalPosts}</div>
          <div style="font-size: 0.75rem; color: var(--neutral-600);">Articles</div>
        </div>
        <div style="background: #f1f5f9; padding: 0.75rem; border-radius: var(--radius);">
          <div style="font-weight: 700; font-size: 1.25rem; color: #4338ca;">${stats.totalViews}</div>
          <div style="font-size: 0.75rem; color: var(--neutral-600);">Views</div>
        </div>
        <div style="background: #f1f5f9; padding: 0.75rem; border-radius: var(--radius);">
          <div style="font-weight: 700; font-size: 1.25rem; color: #e11d48;">${stats.totalLikes}</div>
          <div style="font-size: 0.75rem; color: var(--neutral-600);">Likes</div>
        </div>
      </div>
    `;

    document.getElementById("authorArticlesList").innerHTML = posts.length > 0 ? posts.map((p) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--neutral-200); font-size: 0.9rem;">
        <div>
          <strong style="cursor: pointer; color: var(--primary);" onclick="closeModal('authorProfileModal'); openPostDetail('${p.slug || p.id}')">${p.title}</strong>
          <div style="font-size: 0.75rem; color: var(--neutral-600);">${p.category} • 👁️ ${p.views} • ❤️ ${p.likesCount}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="closeModal('authorProfileModal'); openPostDetail('${p.slug || p.id}')">Read</button>
      </div>
    `).join("") : `<p style="color: var(--neutral-600); font-size: 0.85rem;">No published articles yet.</p>`;

    document.getElementById("authorProfileModal").classList.remove("hidden");
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Report Modal
function openReportModal(targetType, targetId) {
  document.getElementById("reportTargetType").value = targetType;
  document.getElementById("reportTargetId").value = targetId;
  document.getElementById("reportDetailsInput").value = "";
  document.getElementById("reportContentModal").classList.remove("hidden");
}

document.getElementById("reportContentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const targetType = document.getElementById("reportTargetType").value;
  const targetId = document.getElementById("reportTargetId").value;
  const reason = document.getElementById("reportReasonSelect").value;
  const details = document.getElementById("reportDetailsInput").value.trim();

  const url = targetType === "POST"
    ? `/api/v1/blog/posts/${targetId}/report`
    : `/api/v1/blog/comments/${targetId}/report`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ reason, details }),
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Thank you. Your report has been submitted to administrators for safety review.");
      closeModal("reportContentModal");
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

// Admin Moderation Center
document.getElementById("viewAdminModerationBtn")?.addEventListener("click", () => {
  loadModerationQueues();
  document.getElementById("blogModerationModal").classList.remove("hidden");
});

document.querySelectorAll(".mod-tab-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".mod-tab-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");

    if (pill.dataset.tab === "pending") {
      document.getElementById("modPendingContainer").classList.remove("hidden");
      document.getElementById("modReportsContainer").classList.add("hidden");
    } else {
      document.getElementById("modPendingContainer").classList.add("hidden");
      document.getElementById("modReportsContainer").classList.remove("hidden");
    }
  });
});

async function loadModerationQueues() {
  try {
    // 1. Pending Posts
    const postsRes = await fetch("/api/v1/blog/posts?status=PENDING", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const postsData = await postsRes.json();
    const pendingPosts = postsData.data || [];
    document.getElementById("modPendingCount").innerText = pendingPosts.length;

    const pendingContainer = document.getElementById("modPendingContainer");
    pendingContainer.innerHTML = pendingPosts.length > 0 ? pendingPosts.map((p) => `
      <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200); margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span class="badge" style="background: #fef3c7; color: #92400e;">PENDING MODERATION</span>
          <span style="font-size: 0.8rem; color: var(--neutral-600);">${new Date(p.createdAt).toLocaleDateString()}</span>
        </div>
        <h4 style="margin-bottom: 0.25rem;">${p.title}</h4>
        <p style="font-size: 0.85rem; color: var(--neutral-600); margin-bottom: 0.75rem;">Category: <strong>${p.category}</strong> • Author: <strong>${p.author.fullName}</strong> (${p.author.campusId || "Student"})</p>
        <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--neutral-800);">${p.content.slice(0, 200)}...</p>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-success" onclick="adminModeratePost('${p.id}', 'APPROVE')">✅ Approve</button>
          <button class="btn btn-sm btn-danger" onclick="adminModeratePost('${p.id}', 'REJECT')">❌ Reject</button>
          <button class="btn btn-sm btn-secondary" onclick="openPostDetail('${p.slug || p.id}')">👁️ Full Preview</button>
        </div>
      </div>
    `).join("") : `<p style="color: var(--neutral-600); padding: 1rem; text-align: center;">No pending articles in moderation queue.</p>`;

    // 2. Content Reports
    const repRes = await fetch("/api/v1/blog/admin/reports?status=PENDING", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const repData = await repRes.json();
    const reports = repData.data || [];
    document.getElementById("modReportsCount").innerText = reports.length;

    const repContainer = document.getElementById("modReportsContainer");
    repContainer.innerHTML = reports.length > 0 ? reports.map((r) => `
      <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200); margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span class="badge badge-overdue">REPORT: ${r.reason}</span>
          <span style="font-size: 0.8rem; color: var(--neutral-600);">${new Date(r.createdAt).toLocaleString()}</span>
        </div>
        <p style="font-size: 0.85rem; margin-bottom: 0.5rem;">Reported By: <strong>${r.reporter.fullName}</strong> (${r.reporter.campusId})</p>
        ${r.post ? `<p style="font-size: 0.85rem;">Target Article: <strong>${r.post.title}</strong> by ${r.post.author.fullName}</p>` : ""}
        ${r.comment ? `<p style="font-size: 0.85rem;">Target Comment: "<em>${r.comment.content}</em>" by ${r.comment.user.fullName}</p>` : ""}
        ${r.details ? `<p style="font-size: 0.85rem; background: #fff; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--neutral-200); margin: 0.5rem 0;">Details: ${r.details}</p>` : ""}
        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <button class="btn btn-sm btn-success" onclick="adminResolveReport('${r.id}', 'RESOLVED')">Resolve</button>
          <button class="btn btn-sm btn-secondary" onclick="adminResolveReport('${r.id}', 'DISMISSED')">Dismiss</button>
        </div>
      </div>
    `).join("") : `<p style="color: var(--neutral-600); padding: 1rem; text-align: center;">No unresolved reports in queue.</p>`;
  } catch (err) {
    console.error("Moderation load failed:", err.message);
  }
}

async function adminModeratePost(postId, action) {
  const note = prompt(`Enter optional note for ${action}:`) || undefined;
  try {
    const res = await fetch(`/api/v1/blog/admin/posts/${postId}/moderate`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ action, note }),
    });
    const result = await res.json();
    if (result.success) {
      alert(`Post ${action.toLowerCase()}d successfully.`);
      loadModerationQueues();
      loadBlogPosts();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function adminResolveReport(reportId, action) {
  try {
    const res = await fetch(`/api/v1/blog/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ action }),
    });
    const result = await res.json();
    if (result.success) {
      loadModerationQueues();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ====================================================
// PHASE 8: AI ACADEMIC ASSISTANT & RAG SYSTEM
// ====================================================

let activeAiConversationId = null;
let activeAiMode = "general";

// Mode Pills Selector
document.querySelectorAll(".ai-mode-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".ai-mode-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");
    activeAiMode = pill.dataset.mode || "general";
  });
});

// Load Course Offerings for Grounding Scope
async function loadAiOfferings() {
  const select = document.getElementById("aiCourseOfferingFilter");
  if (!select) return;
  try {
    const res = await fetch("/api/v1/academic/offerings/my-courses", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      select.innerHTML = `<option value="">All Approved Repository Documents</option>` +
        result.data.map(o => `<option value="${o.id}">${o.course?.code || "Course"} - ${o.course?.title || "Offering"}</option>`).join("");
    }
  } catch (err) {
    console.error("AI Offerings load failed:", err.message);
  }
}

// Load User Quota
async function loadAiQuota() {
  const badge = document.getElementById("aiQuotaBadge");
  if (!badge) return;
  try {
    const res = await fetch("/api/v1/ai/quota", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success && result.data) {
      const q = result.data;
      badge.innerText = `⚡ Daily Quota: ${q.dailyRemaining.toLocaleString()} / ${q.dailyTokenLimit.toLocaleString()} tokens`;
      badge.style.background = q.dailyRemaining < 5000 ? "#fee2e2" : "#e0e7ff";
      badge.style.color = q.dailyRemaining < 5000 ? "#991b1b" : "#4338ca";
    }
  } catch (err) {
    console.error("AI Quota load failed:", err.message);
  }
}

// Load Conversations List
async function loadAiConversations() {
  const list = document.getElementById("aiConversationsList");
  if (!list) return;

  try {
    const res = await fetch("/api/v1/ai/conversations", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      list.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--neutral-600); font-size: 0.85rem;">No conversations yet. Start a new chat!</div>`;
      return;
    }

    list.innerHTML = result.data.map((c) => `
      <div class="ai-convo-item ${c.id === activeAiConversationId ? "active" : ""}" style="padding: 0.65rem 0.75rem; border-radius: var(--radius); cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: ${c.id === activeAiConversationId ? "#e0e7ff" : "transparent"}; margin-bottom: 0.25rem;" onclick="selectAiConversation('${c.id}')">
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; font-weight: ${c.id === activeAiConversationId ? "700" : "500"}; color: ${c.id === activeAiConversationId ? "#4338ca" : "inherit"};">
          💬 ${c.title}
        </div>
        <button class="btn btn-sm" style="padding: 0.1rem 0.35rem; font-size: 0.7rem; color: var(--danger); background: transparent; border: 0;" onclick="event.stopPropagation(); deleteAiConversation('${c.id}')">✕</button>
      </div>
    `).join("");
  } catch (err) {
    list.innerHTML = `<div style="color: var(--danger); font-size: 0.8rem; padding: 1rem;">Failed to load conversations</div>`;
  }
}

// Select and open conversation
async function selectAiConversation(conversationId) {
  activeAiConversationId = conversationId;
  loadAiConversations();

  const container = document.getElementById("aiMessagesContainer");
  container.innerHTML = `<div style="text-align: center; margin: auto; color: var(--neutral-600);">Loading messages...</div>`;

  try {
    const res = await fetch(`/api/v1/ai/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="color: var(--danger); text-align: center; margin: auto;">Could not load messages: ${result.error}</div>`;
      return;
    }

    const msgs = result.data.messages || [];

    if (msgs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; margin: auto; max-width: 440px; color: var(--neutral-600);">
          <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">🤖</p>
          <h3 style="margin-bottom: 0.5rem;">Conversation Ready</h3>
          <p style="font-size: 0.85rem;">Ask a question below. The assistant can explain code, solve math problems, or reference course materials.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = msgs.map((m) => renderAiMessageBubble(m)).join("");
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; margin: auto;">Error: ${err.message}</div>`;
  }
}

// Render message bubble
function renderAiMessageBubble(m) {
  const isUser = m.role === "user";
  return `
    <div style="display: flex; gap: 0.75rem; align-items: flex-start; justify-content: ${isUser ? "flex-end" : "flex-start"};">
      ${!isUser ? `
        <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; flex-shrink: 0;">
          🤖
        </div>
      ` : ""}
      <div style="max-width: 78%; background: ${isUser ? "#4f46e5" : "#f8fafc"}; color: ${isUser ? "#fff" : "var(--neutral-900)"}; padding: 0.85rem 1.15rem; border-radius: 12px; border: ${isUser ? "none" : "1px solid var(--neutral-200)"}; line-height: 1.6; font-size: 0.95rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
        ${isUser ? `<div style="white-space: pre-wrap;">${m.content}</div>` : `
          <div>${renderMarkdown(m.content)}</div>
          ${m.sources && m.sources.length > 0 ? `
            <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--neutral-200); font-size: 0.75rem; color: var(--neutral-600);">
              <strong>📚 Grounded Sources:</strong>
              <ul style="margin: 0.25rem 0 0 1rem; padding: 0;">
                ${m.sources.map(s => `<li><code>${s}</code></li>`).join("")}
              </ul>
            </div>
          ` : ""}
        `}
        <div style="font-size: 0.7rem; color: ${isUser ? "rgba(255,255,255,0.7)" : "var(--neutral-500)"}; margin-top: 0.35rem; text-align: right;">
          ${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      ${isUser ? `
        <div style="width: 34px; height: 34px; border-radius: 50%; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; flex-shrink: 0;">
          👤
        </div>
      ` : ""}
    </div>
  `;
}

// New Chat Button
document.getElementById("newAiChatBtn")?.addEventListener("click", () => {
  activeAiConversationId = null;
  loadAiConversations();
  const container = document.getElementById("aiMessagesContainer");
  container.innerHTML = `
    <div style="text-align: center; margin: auto; max-width: 440px; color: var(--neutral-600);">
      <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">🤖</p>
      <h3 style="margin-bottom: 0.5rem;">How can I help with your academics today?</h3>
      <p style="font-size: 0.85rem;">Ask questions about algorithms, mathematical derivations, exam preparation, or request a customized study plan.</p>
    </div>
  `;
});

// Delete Conversation
async function deleteAiConversation(conversationId) {
  if (!confirm("Are you sure you want to delete this chat thread?")) return;
  try {
    const res = await fetch(`/api/v1/ai/conversations/${conversationId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();
    if (result.success) {
      if (activeAiConversationId === conversationId) {
        activeAiConversationId = null;
        document.getElementById("newAiChatBtn").click();
      }
      loadAiConversations();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Send Message Form
document.getElementById("aiChatForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("aiPromptInput");
  const prompt = input.value.trim();
  if (!prompt) return;

  const courseOfferingId = document.getElementById("aiCourseOfferingFilter").value || undefined;
  const container = document.getElementById("aiMessagesContainer");

  // If new conversation, create thread first
  if (!activeAiConversationId) {
    try {
      const initRes = await fetch("/api/v1/ai/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ title: prompt.slice(0, 30) }),
      });
      const initData = await initRes.json();
      if (initData.success) {
        activeAiConversationId = initData.data.id;
        container.innerHTML = "";
      } else {
        alert(initData.error);
        return;
      }
    } catch (err) {
      alert(err.message);
      return;
    }
  }

  // Append user bubble immediately
  container.innerHTML += renderAiMessageBubble({
    role: "user",
    content: prompt,
    createdAt: new Date().toISOString(),
  });
  input.value = "";

  // Append typing indicator
  const typingId = `typing_${Date.now()}`;
  container.innerHTML += `
    <div id="${typingId}" style="display: flex; gap: 0.75rem; align-items: center; color: var(--neutral-600); font-size: 0.85rem;">
      <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center;">🤖</div>
      <div>Thinking & consulting academic sources... ⏳</div>
    </div>
  `;
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch(`/api/v1/ai/conversations/${activeAiConversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({
        prompt,
        mode: activeAiMode,
        courseOfferingId,
      }),
    });
    const result = await res.json();

    document.getElementById(typingId)?.remove();

    if (result.success) {
      container.innerHTML += renderAiMessageBubble(result.data.message);
      container.scrollTop = container.scrollHeight;
      loadAiQuota();
      loadAiConversations();
    } else {
      container.innerHTML += `
        <div style="color: var(--danger); padding: 0.75rem; background: #fee2e2; border-radius: var(--radius); font-size: 0.9rem;">
          ⚠️ ${result.error}
        </div>
      `;
    }
  } catch (err) {
    document.getElementById(typingId)?.remove();
    alert(`Error: ${err.message}`);
  }
});

// Shift+Enter / Enter listener in textarea
document.getElementById("aiPromptInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("aiChatForm").requestSubmit();
  }
});

// Admin Analytics Modal
document.getElementById("openAiAnalyticsBtn")?.addEventListener("click", async () => {
  const modal = document.getElementById("aiAnalyticsModal");
  const body = document.getElementById("aiAnalyticsBody");
  body.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading institutional AI analytics...</div>`;
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/v1/ai/admin/analytics", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    const result = await res.json();

    if (!result.success) {
      body.innerHTML = `<div style="color: var(--danger); text-align: center;">${result.error}</div>`;
      return;
    }

    const a = result.data;
    body.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700;">${a.totalRequests.toLocaleString()}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Total AI Requests</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #4338ca;">${a.totalTokens.toLocaleString()}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Tokens Consumed</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #16a34a;">${a.activeUsersToday}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Active Users Today</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #0284c7;">$${a.totalCostEstimated}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Estimated API Cost</div>
        </div>
      </div>

      <h4 style="margin-bottom: 0.75rem;">Top Consuming Students:</h4>
      ${a.topUsers.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Requests</th>
              <th>Tokens Used</th>
            </tr>
          </thead>
          <tbody>
            ${a.topUsers.map(u => `
              <tr>
                <td><strong>${u.user.fullName}</strong> (${u.user.campusId || "User"})</td>
                <td>${u.requests}</td>
                <td>${u.tokens.toLocaleString()} tokens</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<p style="color: var(--neutral-600);">No usage records logged yet.</p>`}
    `;
  } catch (err) {
    body.innerHTML = `<div style="color: var(--danger); text-align: center;">Error: ${err.message}</div>`;
  }
});

// ==========================================
// PHASE 9: SETTINGS & TELEGRAM UNIFICATION
// ==========================================

const openSettingsModalBtn = document.getElementById("openSettingsModalBtn");
const settingsModal = document.getElementById("settingsModal");
const generateTgOtpBtn = document.getElementById("generateTgOtpBtn");
const settingsPrefForm = document.getElementById("settingsPrefForm");

openSettingsModalBtn?.addEventListener("click", () => {
  openSettingsModal();
});

async function openSettingsModal() {
  openModal("settingsModal");
  await loadUserSettingsAndTelegram();
}

async function loadUserSettingsAndTelegram() {
  const token = getAuthToken();
  if (!token) {
    const badge = document.getElementById("settingsTgBadge");
    if (badge) {
      badge.textContent = "Not Logged In";
      badge.style.background = "var(--neutral-400)";
    }
    return;
  }

  try {
    // 1. Fetch user profile for Telegram link state
    const profileRes = await fetch("/api/v1/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profileResult = await profileRes.json();
    if (profileResult.success) {
      const u = profileResult.data;
      const isLinked = !!u.telegramChatId;
      const badge = document.getElementById("settingsTgBadge");
      const linkedInfo = document.getElementById("settingsTgLinkedInfo");
      const unlinkedBox = document.getElementById("settingsTgUnlinkedBox");

      if (badge) {
        if (isLinked) {
          badge.textContent = "Linked & Synced";
          badge.style.background = "var(--success)";
          linkedInfo?.classList.remove("hidden");
          const unEl = document.getElementById("settingsTgUsername");
          if (unEl) unEl.textContent = u.telegramUsername ? `@${u.telegramUsername}` : "(No username)";
          const idEl = document.getElementById("settingsTgChatId");
          if (idEl) idEl.textContent = u.telegramChatId;
          unlinkedBox?.classList.add("hidden");
        } else {
          badge.textContent = "Unlinked";
          badge.style.background = "var(--warning)";
          linkedInfo?.classList.add("hidden");
          unlinkedBox?.classList.remove("hidden");
        }
      }
    }

    // 2. Fetch notification preferences
    const prefRes = await fetch("/api/v1/notifications/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prefResult = await prefRes.json();
    if (prefResult.success) {
      const p = prefResult.data;
      const r3 = document.getElementById("prefRemind3Days");
      if (r3) r3.checked = p.remind3Days;
      const r1 = document.getElementById("prefRemind1Day");
      if (r1) r1.checked = p.remind1Day;
      const r2 = document.getElementById("prefRemind2Hours");
      if (r2) r2.checked = p.remind2Hours;
      const ann = document.getElementById("prefAnnouncements");
      if (ann) ann.checked = p.announcements;
      const web = document.getElementById("prefChannelWeb");
      if (web) web.checked = p.channelWeb;
      const tg = document.getElementById("prefChannelTelegram");
      if (tg) tg.checked = p.channelTelegram;
    }
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

// Generate Telegram Link Token OTP
generateTgOtpBtn?.addEventListener("click", async () => {
  const token = getAuthToken();
  if (!token) return alert("Please log in first.");

  try {
    generateTgOtpBtn.disabled = true;
    generateTgOtpBtn.textContent = "Generating...";

    const res = await fetch("/api/v1/users/me/telegram-link-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();
    if (result.success) {
      const { otp } = result.data;
      const codeEl = document.getElementById("tgOtpCode");
      if (codeEl) codeEl.textContent = otp;
      document.getElementById("tgOtpResultBox")?.classList.remove("hidden");

      const directLink = `https://t.me/CampusSuperAppBot?start=link_${otp}`;
      const directBtn = document.getElementById("tgDirectLinkBtn");
      if (directBtn) {
        directBtn.href = directLink;
      }
    } else {
      alert(`Error generating token: ${result.message}`);
    }
  } catch (err) {
    alert(`Failed to generate token: ${err.message}`);
  } finally {
    generateTgOtpBtn.disabled = false;
    generateTgOtpBtn.textContent = "🔑 Generate Linking Code (OTP)";
  }
});

// Save Notification Preferences Form
settingsPrefForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = getAuthToken();
  if (!token) return alert("Please log in first.");

  const payload = {
    remind3Days: document.getElementById("prefRemind3Days")?.checked ?? true,
    remind1Day: document.getElementById("prefRemind1Day")?.checked ?? true,
    remind2Hours: document.getElementById("prefRemind2Hours")?.checked ?? true,
    announcements: document.getElementById("prefAnnouncements")?.checked ?? true,
    channelWeb: document.getElementById("prefChannelWeb")?.checked ?? true,
    channelTelegram: document.getElementById("prefChannelTelegram")?.checked ?? true,
  };

  try {
    const res = await fetch("/api/v1/notifications/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Notification preferences updated successfully!");
    } else {
      alert(`Error updating preferences: ${result.message}`);
    }
  } catch (err) {
    alert(`Failed to save preferences: ${err.message}`);
  }
});

// ==========================================
// PHASE 10: MASTER ADMINISTRATION & ANALYTICS
// ==========================================

async function loadAdminAnalytics() {
  const token = getAuthToken();
  if (!token) return;

  try {
    // 1. Fetch Institutional Analytics
    const analyticsRes = await fetch("/api/v1/admin/analytics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const analyticsResult = await analyticsRes.json();
    if (analyticsResult.success) {
      const a = analyticsResult.data;
      const elU = document.getElementById("statTotalUsers");
      if (elU) elU.textContent = a.users.total.toLocaleString();
      const elV = document.getElementById("statVerifiedStudents");
      if (elV) elV.textContent = a.users.verifiedStudents.toLocaleString();
      const elO = document.getElementById("statActiveOfferings");
      if (elO) elO.textContent = a.academic.activeOfferings.toLocaleString();
      const elCls = document.getElementById("statTotalClasses");
      if (elCls) elCls.textContent = a.academic.totalClasses.toLocaleString();
      const elCrs = document.getElementById("statTotalCourses");
      if (elCrs) elCrs.textContent = a.academic.totalCourses.toLocaleString();
      const elCr = document.getElementById("statCompletionRate");
      if (elCr) elCr.textContent = `${a.assignments.completionRate}%`;
      const elSub = document.getElementById("statSubmissions");
      if (elSub) elSub.textContent = a.assignments.totalSubmissions.toLocaleString();
      const elGrd = document.getElementById("statGradedSubmissions");
      if (elGrd) elGrd.textContent = a.assignments.gradedSubmissions.toLocaleString();
      const elPr = document.getElementById("statQuizPassRate");
      if (elPr) elPr.textContent = `${a.assessments.passRate}%`;
      const elAtt = document.getElementById("statCompletedAttempts");
      if (elAtt) elAtt.textContent = a.assessments.completedAttempts.toLocaleString();
      const elAvg = document.getElementById("statAvgQuizScore");
      if (elAvg) elAvg.textContent = `${a.assessments.averagePercentageScore}`;
      const elMat = document.getElementById("statApprovedMaterials");
      if (elMat) elMat.textContent = a.resources.approvedMaterials.toLocaleString();
      const elArch = document.getElementById("statApprovedArchive");
      if (elArch) elArch.textContent = a.resources.approvedArchiveItems.toLocaleString();
      const elAiTok = document.getElementById("statAiTokens");
      if (elAiTok) elAiTok.textContent = a.ai.totalTokensConsumed.toLocaleString();
      const elAiReq = document.getElementById("statAiRequests");
      if (elAiReq) elAiReq.textContent = a.ai.totalRequests.toLocaleString();

      // Queues
      const qMat = document.getElementById("queuePendingMaterials");
      if (qMat) qMat.textContent = a.resources.pendingMaterialsModeration;
      const qArch = document.getElementById("queuePendingArchive");
      if (qArch) qArch.textContent = a.resources.pendingArchiveModeration;
      const qRep = document.getElementById("queuePendingReports");
      if (qRep) qRep.textContent = a.community.pendingReportsQueue;
    }

    // 2. Fetch System Health Telemetry
    const healthRes = await fetch("/api/v1/admin/system/health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const healthResult = await healthRes.json();
    if (healthResult.success) {
      const h = healthResult.data;
      const container = document.getElementById("adminSystemHealthBody");
      if (container) {
        container.innerHTML = `
          <div style="display: flex; justify-content: space-between;">
            <strong>Database Latency:</strong>
            <span style="color: ${h.database.latencyMs < 50 ? 'var(--success)' : 'var(--warning)'}; font-weight: 600;">
              ${h.database.status.toUpperCase()} (${h.database.latencyMs}ms)
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <strong>Telegram Bot Engine:</strong>
            <span style="color: ${h.telegramBot.status === 'connected' ? 'var(--success)' : 'var(--neutral-600)'};">
              ${h.telegramBot.status}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <strong>Storage Status:</strong>
            <span style="color: ${h.storage.healthy ? 'var(--success)' : 'var(--danger)'};">
              ${h.storage.healthy ? 'All Disks Writable' : 'Degraded'}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <strong>Process Uptime:</strong>
            <span>${Math.floor(h.runtime.uptimeSeconds / 60)} min (${h.runtime.uptimeSeconds}s)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <strong>Heap Memory Usage:</strong>
            <span>${h.runtime.memoryUsageMb.heapUsed} MB / ${h.runtime.memoryUsageMb.heapTotal} MB</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <strong>Node.js Environment:</strong>
            <span>${h.runtime.nodeVersion} (${h.runtime.platform} ${h.runtime.arch})</span>
          </div>
        `;
      }
    }

    // 3. Fetch Audit Logs
    const logsRes = await fetch("/api/v1/admin/audit-logs?limit=15", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const logsResult = await logsRes.json();
    if (logsResult.success) {
      const tbody = document.getElementById("adminAuditLogsBody");
      if (tbody) {
        if (logsResult.data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--neutral-500);">No administrative audit events recorded yet.</td></tr>`;
        } else {
          tbody.innerHTML = logsResult.data.map((l) => `
            <tr style="border-bottom: 1px solid var(--neutral-200);">
              <td style="padding: 0.5rem;"><code>${l.action}</code></td>
              <td style="padding: 0.5rem;">${l.actor ? l.actor.fullName : 'System'}</td>
              <td style="padding: 0.5rem;">${l.entity}${l.entityId ? ` (#${l.entityId.slice(0, 8)})` : ''}</td>
              <td style="padding: 0.5rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.details || '-'}</td>
              <td style="padding: 0.5rem;"><code>${l.ipAddress || 'local'}</code></td>
              <td style="padding: 0.5rem;">${new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
          `).join("");
        }
      }
    }
  } catch (err) {
    console.error("Failed to load admin analytics:", err);
  }
}

document.getElementById("refreshAdminAnalyticsBtn")?.addEventListener("click", () => {
  loadAdminAnalytics();
});

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();
  loadDashboard();
  loadNotifications();
});
