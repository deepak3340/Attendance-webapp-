/**
 * Teacher Portal Controller
 * Fully sanitized against stored and DOM-based XSS
 */

const TeacherApp = {
  currentUser: null,
  myAssignments: [],
  activeStudentsList: [],
  isCurrentSessionLocked: false,

  async init() {
    this.currentUser = API.getStoredUser();
    const token = API.getStoredToken();
    if (!this.currentUser || this.currentUser.role !== "teacher" || !token) {
      API.clearStoredUser();
      window.location.href = "/login";
      return;
    }

    this.setupUI();
    this.setupNavigation();
    this.setupModals();
    await this.loadMyAssignments();
    this.loadDashboardStats();
  },

  setupUI() {
    document.getElementById("userDisplayName").textContent = this.currentUser.name || "Teacher";
    document.getElementById("userRoleDisplay").textContent = `Teacher (UID: ${this.currentUser.teacherCode || "-"})`;
    document.getElementById("sidebarSchoolName").textContent = this.currentUser.schoolName || "संस्कार हाई स्कूल, गरोडा";

    // Mobile menu toggle
    const toggleBtn = document.getElementById("btnMenuToggle");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    toggleBtn?.addEventListener("click", () => {
      sidebar?.classList.toggle("active");
      overlay?.classList.toggle("active");
    });
    overlay?.addEventListener("click", () => {
      sidebar?.classList.remove("active");
      overlay?.classList.remove("active");
    });

    // Logout
    document.querySelectorAll(".btn-logout").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await API.post("/api/auth/logout");
        } catch (e) {}
        API.clearStoredUser();
        window.location.href = "/login";
      });
    });

    // Default today's date in attendance picker
    const today = new Date().toISOString().split("T")[0];
    const markDateInput = document.getElementById("markDateInput");
    if (markDateInput) markDateInput.value = today;
  },

  setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        const viewId = item.getAttribute("data-view");
        this.switchView(viewId);

        document.getElementById("sidebar")?.classList.remove("active");
        document.getElementById("sidebarOverlay")?.classList.remove("active");
      });
    });

    // Back to dashboard buttons
    document.querySelectorAll(".btn-back-dashboard").forEach(btn => {
      btn.addEventListener("click", () => this.switchView("dashboardView"));
    });
  },

  switchView(viewId) {
    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.style.display = "none";
    });
    const target = document.getElementById(viewId);
    if (target) {
      target.style.display = "block";
    }

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("active", item.getAttribute("data-view") === viewId);
    });

    if (viewId === "dashboardView") this.loadDashboardStats();
    if (viewId === "markAttendanceView") this.populateClassDropdown();
    if (viewId === "attendanceHistoryView") this.loadAttendanceHistory();
    if (viewId === "profileView") this.loadProfile();
  },

  async loadMyAssignments() {
    try {
      const res = await API.get("/api/assignments", { status: "active" });
      this.myAssignments = res.assignments || [];
      this.populateClassDropdown();
    } catch (e) {
      console.error("Error loading assignments:", e);
    }
  },

  populateClassDropdown() {
    const classSelect = document.getElementById("markClassSelect");
    const filterClassSelect = document.getElementById("filterHistClass");
    if (!classSelect) return;

    // Get unique classes assigned to this teacher
    const classMap = new Map();
    this.myAssignments.forEach(a => {
      if (!classMap.has(a.classId)) {
        classMap.set(a.classId, a.className);
      }
    });

    let optionsHtml = '<option value="">-- Select Assigned Class --</option>';
    classMap.forEach((name, id) => {
      optionsHtml += `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
    });

    classSelect.innerHTML = optionsHtml;
    if (filterClassSelect) {
      filterClassSelect.innerHTML = '<option value="">All My Classes</option>' + optionsHtml.replace('<option value="">-- Select Assigned Class --</option>', '');
    }
  },

  handleClassSelectionChange() {
    const classId = document.getElementById("markClassSelect").value;
    const subSelect = document.getElementById("markSubjectSelect");
    if (!subSelect) return;

    if (!classId) {
      subSelect.innerHTML = '<option value="">-- First Select Class --</option>';
      subSelect.disabled = true;
      return;
    }

    // Filter assignments for this class
    const validSubjects = this.myAssignments.filter(a => a.classId === classId);
    if (validSubjects.length === 0) {
      subSelect.innerHTML = '<option value="">No assigned subjects</option>';
      subSelect.disabled = true;
      return;
    }

    subSelect.disabled = false;
    subSelect.innerHTML = '<option value="">-- Select Assigned Subject --</option>' + validSubjects.map(s => `
      <option value="${escapeHtml(s.subjectId)}">${escapeHtml(s.subjectName)}</option>
    `).join("");
  },

  // ================= 1. DASHBOARD STATS ================= //
  async loadDashboardStats() {
    try {
      const res = await API.get("/api/dashboard/teacher-stats");

      document.getElementById("statMyClassesCount").textContent = res.classesCount || 0;
      document.getElementById("statMyAssignmentsCount").textContent = res.assignedCount || 0;
      document.getElementById("statMyTodayMarked").textContent = res.todayMarkedCount || 0;
      
      const myAttBadge = document.getElementById("statMyAttendanceToday");
      const statusText = res.myAttendanceToday || "Not Marked";
      myAttBadge.textContent = statusText;
      myAttBadge.className = `badge ${statusText === 'Present' ? 'badge-success' : statusText === 'Absent' ? 'badge-danger' : 'badge-neutral'}`;

      // My Assigned Classes List
      const listContainer = document.getElementById("myAssignedClassesList");
      if (listContainer) {
        if (!res.assignments || res.assignments.length === 0) {
          listContainer.innerHTML = `<div style="padding:1rem;color:#64748B;">No active class assignments. Please contact the Principal.</div>`;
        } else {
          listContainer.innerHTML = res.assignments.map(a => `
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:var(--radius-md);padding:0.85rem 1rem;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <strong style="font-size:0.95rem;color:var(--dark-bg);">${escapeHtml(a.className)}</strong>
                <div style="font-size:0.825rem;color:var(--primary);font-weight:600;margin-top:0.2rem;">${escapeHtml(a.subjectName)}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="TeacherApp.quickMarkAttendance('${escapeHtml(a.classId)}', '${escapeHtml(a.subjectId)}')">
                Mark Attendance
              </button>
            </div>
          `).join("");
        }
      }
    } catch (err) {
      console.error("Dashboard error:", err);
    }
  },

  quickMarkAttendance(classId, subjectId) {
    this.switchView("markAttendanceView");
    setTimeout(() => {
      document.getElementById("markClassSelect").value = classId;
      this.handleClassSelectionChange();
      document.getElementById("markSubjectSelect").value = subjectId;
      this.handleLoadStudentsForAttendance();
    }, 100);
  },

  // ================= 2. MARK ATTENDANCE ================= //
  async handleLoadStudentsForAttendance() {
    const classId = document.getElementById("markClassSelect").value;
    const subjectId = document.getElementById("markSubjectSelect").value;
    const dateStr = document.getElementById("markDateInput").value;
    const period = document.getElementById("markPeriodSelect").value;

    if (!classId || !subjectId || !dateStr || !period) {
      Toast.warning("Please select Class, Subject, Date, and Period.");
      return;
    }

    const board = document.getElementById("attendanceBoard");
    const tbody = document.getElementById("markingTableBody");
    const lockBanner = document.getElementById("attendanceLockBanner");
    const saveBtn = document.getElementById("btnSaveAttendance");

    board.style.display = "block";
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:2.5rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/attendance/session", {
        classId, subjectId, date: dateStr, period
      });

      this.isCurrentSessionLocked = res.isLocked;
      this.activeStudentsList = res.students || [];

      // Lock banner handling
      if (res.isLocked) {
        lockBanner.style.display = "flex";
        saveBtn.disabled = true;
        saveBtn.innerHTML = `🔒 Attendance Locked by Principal`;
      } else {
        lockBanner.style.display = "none";
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Save Attendance`;
      }

      if (this.activeStudentsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:2rem;color:#64748B;">No active students enrolled in this class.</td></tr>`;
        return;
      }

      document.getElementById("sessionStudentCount").textContent = `${this.activeStudentsList.length} Students`;
      this.renderAttendanceTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--danger);padding:2rem;">${escapeHtml(err.message)}</td></tr>`;
    }
  },

  renderAttendanceTable() {
    const tbody = document.getElementById("markingTableBody");
    const isLocked = this.isCurrentSessionLocked;

    tbody.innerHTML = this.activeStudentsList.map((s, idx) => `
      <tr>
        <td><strong style="font-size:1.05rem;">${escapeHtml(s.rollNumber)}</strong></td>
        <td>
          <div style="font-weight:600;font-size:0.95rem;">${escapeHtml(s.name)}</div>
          <div style="font-size:0.775rem;color:#64748B;">ID: ${escapeHtml(s.studentId)}</div>
        </td>
        <td>
          <div class="radio-group-attendance">
            <button type="button" 
              class="radio-attendance-btn ${s.status === 'Present' ? 'active-present' : ''}" 
              ${isLocked ? 'disabled' : ''}
              onclick="TeacherApp.setStudentStatus(${idx}, 'Present')">
              Present
            </button>
            <button type="button" 
              class="radio-attendance-btn ${s.status === 'Absent' ? 'active-absent' : ''}" 
              ${isLocked ? 'disabled' : ''}
              onclick="TeacherApp.setStudentStatus(${idx}, 'Absent')">
              Absent
            </button>
          </div>
        </td>
        <td>
          <span class="badge ${s.status === 'Present' ? 'badge-success' : 'badge-danger'}">
            ${escapeHtml(s.status)}
          </span>
        </td>
      </tr>
    `).join("");
  },

  setStudentStatus(index, status) {
    if (this.isCurrentSessionLocked) return;
    this.activeStudentsList[index].status = status;
    this.renderAttendanceTable();
  },

  markAllPresent() {
    if (this.isCurrentSessionLocked) return;
    this.activeStudentsList.forEach(s => s.status = "Present");
    this.renderAttendanceTable();
    Toast.info("Marked all students as Present.");
  },

  resetAttendance() {
    if (this.isCurrentSessionLocked) return;
    this.handleLoadStudentsForAttendance();
    Toast.info("Attendance form reset.");
  },

  async handleSaveAttendance() {
    if (this.isCurrentSessionLocked) {
      Toast.error("This session is locked by the Principal. Attendance cannot be modified.");
      return;
    }

    const classId = document.getElementById("markClassSelect").value;
    const subjectId = document.getElementById("markSubjectSelect").value;
    const dateStr = document.getElementById("markDateInput").value;
    const period = document.getElementById("markPeriodSelect").value;

    const saveBtn = document.getElementById("btnSaveAttendance");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner"></div> Saving Attendance...`;

    const records = this.activeStudentsList.map(s => ({
      studentId: s.studentId,
      status: s.status
    }));

    try {
      const res = await API.post("/api/attendance/student", {
        classId,
        subjectId,
        date: dateStr,
        period,
        records
      });

      Toast.success(res.message || "Attendance saved successfully!");
      this.handleLoadStudentsForAttendance();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message || "Failed to save attendance.");
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Save Attendance`;
    }
  },

  // ================= 3. ATTENDANCE HISTORY ================= //
  async loadAttendanceHistory() {
    const classId = document.getElementById("filterHistClass")?.value || "";
    const dateFrom = document.getElementById("filterHistDateFrom")?.value || "";
    const dateTo = document.getElementById("filterHistDateTo")?.value || "";
    const status = document.getElementById("filterHistStatus")?.value || "";
    const studentName = document.getElementById("filterHistStudentName")?.value || "";

    const tbody = document.getElementById("attendanceHistoryTableBody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2.5rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/attendance/student-records", {
        classId, dateFrom, dateTo, status, studentName
      });

      if (!res.records || res.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem;color:#64748B;">No attendance records found for your assigned classes.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.records.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.date)}</strong></td>
          <td>${escapeHtml(r.period)}</td>
          <td><strong>${escapeHtml(r.rollNumber)}</strong></td>
          <td>${escapeHtml(r.studentName)}</td>
          <td><span class="badge badge-primary">${escapeHtml(r.className)}</span></td>
          <td>${escapeHtml(r.subjectName)}</td>
          <td>
            <span class="badge ${r.status === 'Present' ? 'badge-success' : 'badge-danger'}">
              ${escapeHtml(r.status)}
            </span>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger);padding:1.5rem;">${escapeHtml(err.message)}</td></tr>`;
    }
  },

  // ================= 4. PROFILE & CHANGE PASSWORD ================= //
  loadProfile() {
    document.getElementById("profTeacherName").textContent = this.currentUser.name;
    document.getElementById("profTeacherCode").textContent = this.currentUser.teacherCode || "-";
    document.getElementById("profTeacherMobile").textContent = this.currentUser.mobileNumber || "-";
  },

  openChangeMyPasswordModal() {
    document.getElementById("changeMyPassForm").reset();
    Modal.open("changeMyPassModal");
  },

  async handleChangeMyPassSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById("myCurrentPassword").value;
    const newPassword = document.getElementById("myNewPassword").value;
    const repeatPassword = document.getElementById("myRepeatPassword").value;

    if (newPassword !== repeatPassword) {
      Toast.error("New passwords do not match.");
      return;
    }

    try {
      await API.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
        repeatPassword
      });
      Toast.success("Password changed successfully!");
      Modal.close("changeMyPassModal");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  setupModals() {
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.classList.remove("active");
        }
      });
      overlay.querySelector(".modal-close-btn")?.addEventListener("click", () => {
        overlay.classList.remove("active");
      });
    });
  }
};

window.TeacherApp = TeacherApp;
document.addEventListener("DOMContentLoaded", () => {
  TeacherApp.init();
});
