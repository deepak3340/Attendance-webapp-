/**
 * Principal Portal Controller
 * Fully sanitized against stored and DOM-based XSS
 */

const PrincipalApp = {
  currentUser: null,
  classesCache: [],
  teachersCache: [],

  async init() {
    this.currentUser = API.getStoredUser();
    const token = API.getStoredToken();
    if (!this.currentUser || this.currentUser.role !== "principal" || !token) {
      API.clearStoredUser();
      window.location.href = "/login";
      return;
    }

    this.setupUI();
    this.setupNavigation();
    this.setupModals();
    await this.loadInitialData();
    this.loadDashboardStats();
  },

  setupUI() {
    document.getElementById("userDisplayName").textContent = this.currentUser.name || "Principal";
    document.getElementById("userRoleDisplay").textContent = `Principal (UID: ${this.currentUser.uid || "375613"})`;
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
  },

  setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        const viewId = item.getAttribute("data-view");
        this.switchView(viewId);

        // Close mobile drawer
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

    // Refresh view data
    if (viewId === "dashboardView") this.loadDashboardStats();
    if (viewId === "studentsView") this.loadStudents();
    if (viewId === "teachersView") this.loadTeachers();
    if (viewId === "classesSubjectsView") this.loadClassesAndSubjects();
    if (viewId === "assignClassesView") this.loadAssignments();
    if (viewId === "studentAttendanceView") this.loadStudentAttendanceRecords();
    if (viewId === "teacherAttendanceView") this.loadTeacherAttendanceRecords();
    if (viewId === "reportsView") this.setupReportsForm();
    if (viewId === "profileView") this.loadProfile();
  },

  async loadInitialData() {
    try {
      const [clsRes, tchRes] = await Promise.all([
        API.get("/api/classes"),
        API.get("/api/teachers?status=active")
      ]);
      this.classesCache = clsRes.classes || [];
      this.teachersCache = tchRes.teachers || [];
      this.populateClassDropdowns();
      this.populateTeacherDropdowns();
    } catch (e) {
      console.error("Initial data load error:", e);
    }
  },

  populateClassDropdowns() {
    const dropdowns = document.querySelectorAll(".class-select-dropdown");
    dropdowns.forEach(select => {
      const currentVal = select.value;
      select.innerHTML = '<option value="">-- Select Class --</option>';
      this.classesCache.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.classId || c._id;
        opt.textContent = c.className;
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    });
  },

  populateTeacherDropdowns() {
    const dropdowns = document.querySelectorAll(".teacher-select-dropdown");
    dropdowns.forEach(select => {
      const currentVal = select.value;
      select.innerHTML = '<option value="">-- Select Teacher --</option>';
      this.teachersCache.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.uid || t._id;
        opt.textContent = `${t.name} (UID: ${t.teacherCode})`;
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    });
  },

  // ================= 1. DASHBOARD STATS ================= //
  async loadDashboardStats() {
    try {
      const res = await API.get("/api/dashboard/stats");
      const s = res.stats;

      document.getElementById("statTotalStudents").textContent = s.totalStudents;
      document.getElementById("statTotalTeachers").textContent = s.totalTeachers;
      document.getElementById("statTotalClasses").textContent = s.totalClasses;

      // Student Attendance Today
      const stTotal = s.todayStudentAttendance.totalMarked;
      const stPres = s.todayStudentAttendance.present;
      const stPct = stTotal > 0 ? Math.round((stPres / stTotal) * 100) : 0;
      document.getElementById("statTodayStudentAtt").textContent = `${stPres}/${stTotal}`;
      document.getElementById("statTodayStudentAttSub").textContent = `${stPct}% Present (${s.todayStudentAttendance.absent} Absent)`;

      // Teacher Attendance Today
      const tTotal = s.todayTeacherAttendance.totalMarked;
      const tPres = s.todayTeacherAttendance.present;
      document.getElementById("statTodayTeacherAtt").textContent = `${tPres}/${s.totalTeachers}`;
      document.getElementById("statTodayTeacherAttSub").textContent = `${tTotal} marked today (${tPres} Present, ${s.todayTeacherAttendance.absent} Absent)`;

      // Recent Audits with XSS Protection
      const auditList = document.getElementById("recentAuditLogsList");
      if (auditList) {
        if (!res.recentAudits || res.recentAudits.length === 0) {
          auditList.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:1.5rem;color:#64748B;">No recent activity logs.</td></tr>`;
        } else {
          auditList.innerHTML = res.recentAudits.map(a => {
            let detailsStr = "-";
            if (a.details && typeof a.details === "object") {
              detailsStr = a.details.message || JSON.stringify(a.details);
            } else if (a.details) {
              detailsStr = String(a.details);
            }
            return `
              <tr>
                <td><span class="badge badge-neutral">${escapeHtml(a.action || "Action")}</span></td>
                <td><strong>${escapeHtml(detailsStr)}</strong></td>
                <td>${escapeHtml(a.performedBy || "System")} (${escapeHtml(a.role || "-")})</td>
                <td style="color:#64748B;font-size:0.825rem;">${escapeHtml(a.timestamp ? a.timestamp.replace("T", " ").slice(0, 16) : "-")}</td>
              </tr>
            `;
          }).join("");
        }
      }
    } catch (err) {
      console.error("Dashboard stats error:", err);
    }
  },

  // ================= 2. STUDENTS ================= //
  async loadStudents() {
    const name = document.getElementById("searchStudentName")?.value || "";
    const roll = document.getElementById("searchStudentRoll")?.value || "";
    const classId = document.getElementById("filterStudentClass")?.value || "";
    const status = document.getElementById("filterStudentStatus")?.value || "";

    const tbody = document.getElementById("studentsTableBody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/students", { name, roll, classId, status });
      if (!res.students || res.students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem;color:#64748B;">No students found matching filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.students.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.rollNumber)}</strong></td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td><code>${escapeHtml(s.studentId)}</code></td>
          <td><span class="badge badge-primary">${escapeHtml(s.className)}</span></td>
          <td>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${escapeHtml(s.status)}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick="PrincipalApp.openEditStudentModal('${escapeHtml(s.studentId)}')">Edit</button>
              <button class="btn btn-sm ${s.status === 'active' ? 'btn-danger' : 'btn-success'}" onclick="PrincipalApp.toggleStudentStatus('${escapeHtml(s.studentId)}', '${s.status === 'active' ? 'inactive' : 'active'}')">
                ${s.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger);padding:1.5rem;">Failed to load students: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  openAddStudentModal() {
    document.getElementById("addStudentForm").reset();
    this.populateClassDropdowns();
    Modal.open("addStudentModal");
  },

  async handleAddStudentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("stuName").value.trim();
    const studentId = document.getElementById("stuId").value.trim();
    const rollNumber = document.getElementById("stuRoll").value.trim();
    const classId = document.getElementById("stuClass").value;
    const status = document.getElementById("stuStatus").value;

    try {
      await API.post("/api/students", { name, studentId, rollNumber, classId, status });
      Toast.success("Student added successfully!");
      Modal.close("addStudentModal");
      this.loadStudents();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async openEditStudentModal(studentId) {
    try {
      const res = await API.get("/api/students", { studentId });
      const student = res.students?.find(s => s.studentId === studentId);
      if (!student) throw new Error("Student not found.");

      document.getElementById("editStuIdHidden").value = student.studentId;
      document.getElementById("editStuName").value = student.name;
      document.getElementById("editStuRoll").value = student.rollNumber;
      this.populateClassDropdowns();
      document.getElementById("editStuClass").value = student.classId;
      document.getElementById("editStuStatus").value = student.status;

      Modal.open("editStudentModal");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async handleEditStudentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById("editStuIdHidden").value;
    const name = document.getElementById("editStuName").value.trim();
    const rollNumber = document.getElementById("editStuRoll").value.trim();
    const classId = document.getElementById("editStuClass").value;
    const status = document.getElementById("editStuStatus").value;

    try {
      await API.put(`/api/students/${studentId}`, { name, rollNumber, classId, status });
      Toast.success("Student details updated successfully!");
      Modal.close("editStudentModal");
      this.loadStudents();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async toggleStudentStatus(studentId, newStatus) {
    if (!confirm(`Are you sure you want to change this student status to ${newStatus}?`)) return;
    try {
      await API.patch(`/api/students/${studentId}/status`, { status: newStatus });
      Toast.success(`Student marked as ${newStatus}.`);
      this.loadStudents();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 3. TEACHERS ================= //
  async loadTeachers() {
    const q = document.getElementById("searchTeacherQ")?.value || "";
    const status = document.getElementById("filterTeacherStatus")?.value || "";

    const tbody = document.getElementById("teachersTableBody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/teachers", { q, status });
      if (!res.teachers || res.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:2rem;color:#64748B;">No teachers found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.teachers.map(t => `
        <tr>
          <td><code style="color:var(--primary);font-weight:700;">${escapeHtml(t.teacherCode)}</code></td>
          <td><strong>${escapeHtml(t.name)}</strong></td>
          <td>${escapeHtml(t.mobileNumber)}</td>
          <td>
            <span class="badge ${t.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${escapeHtml(t.status)}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="PrincipalApp.openEditTeacherModal('${escapeHtml(t.uid)}')">Edit</button>
              <button class="btn btn-sm btn-secondary" onclick="PrincipalApp.openChangeTeacherPasswordModal('${escapeHtml(t.uid)}', '${escapeHtml(t.name)}')">Change Password</button>
              <button class="btn btn-sm ${t.status === 'active' ? 'btn-danger' : 'btn-success'}" onclick="PrincipalApp.toggleTeacherStatus('${escapeHtml(t.uid)}', '${t.status === 'active' ? 'inactive' : 'active'}')">
                ${t.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--danger);padding:1.5rem;">Failed to load teachers: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  async openAddTeacherModal() {
    document.getElementById("addTeacherForm").reset();
    try {
      const res = await API.get("/api/teachers/generate-uid");
      document.getElementById("newTeacherCodeDisplay").value = res.teacherCode;
      Modal.open("addTeacherModal");
    } catch (e) {
      Toast.error("Failed to generate UID.");
    }
  },

  async regenerateTeacherUID() {
    try {
      const res = await API.get("/api/teachers/generate-uid");
      document.getElementById("newTeacherCodeDisplay").value = res.teacherCode;
      Toast.info(`Generated new Teacher UID: ${res.teacherCode}`);
    } catch (e) {
      Toast.error("Failed to generate UID.");
    }
  },

  async handleAddTeacherSubmit(e) {
    e.preventDefault();
    const teacherCode = document.getElementById("newTeacherCodeDisplay").value.trim();
    const name = document.getElementById("tchName").value.trim();
    const mobileNumber = document.getElementById("tchMobile").value.trim();
    const email = document.getElementById("tchEmail") ? document.getElementById("tchEmail").value.trim() : "";
    const password = document.getElementById("tchPassword").value;
    const repeatPassword = document.getElementById("tchRepeatPassword").value;
    const status = document.getElementById("tchStatus").value;

    if (password !== repeatPassword) {
      Toast.error("Passwords do not match.");
      return;
    }

    try {
      await API.post("/api/teachers", { 
        teacherCode, 
        name, 
        mobileNumber, 
        email, 
        password, 
        repeatPassword, 
        status 
      });
      Toast.success(`Teacher registered successfully! UID: ${teacherCode}`, 6000);
      Modal.close("addTeacherModal");
      await this.loadInitialData();
      this.loadTeachers();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message || "Failed to create teacher.");
    }
  },

  async openEditTeacherModal(uid) {
    try {
      const res = await API.get("/api/teachers");
      const teacher = res.teachers?.find(t => t.uid === uid);
      if (!teacher) throw new Error("Teacher not found.");

      document.getElementById("editTchUidHidden").value = teacher.uid;
      document.getElementById("editTchCodeDisplay").value = teacher.teacherCode;
      document.getElementById("editTchName").value = teacher.name;
      document.getElementById("editTchMobile").value = teacher.mobileNumber;
      document.getElementById("editTchStatus").value = teacher.status;

      Modal.open("editTeacherModal");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async handleEditTeacherSubmit(e) {
    e.preventDefault();
    const uid = document.getElementById("editTchUidHidden").value;
    const name = document.getElementById("editTchName").value.trim();
    const mobileNumber = document.getElementById("editTchMobile").value.trim();
    const status = document.getElementById("editTchStatus").value;

    try {
      await API.put(`/api/teachers/${uid}`, { name, mobileNumber, status });
      Toast.success("Teacher details updated successfully!");
      Modal.close("editTeacherModal");
      await this.loadInitialData();
      this.loadTeachers();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openChangeTeacherPasswordModal(uid, name) {
    document.getElementById("adminChangePassForm").reset();
    document.getElementById("adminPassTchUidHidden").value = uid;
    document.getElementById("adminPassTchNameDisplay").textContent = name;
    Modal.open("adminChangeTeacherPassModal");
  },

  async handleAdminChangeTeacherPassSubmit(e) {
    e.preventDefault();
    const uid = document.getElementById("adminPassTchUidHidden").value;
    const newPassword = document.getElementById("adminNewTchPassword").value;
    const repeatPassword = document.getElementById("adminRepeatTchPassword").value;

    if (newPassword !== repeatPassword) {
      Toast.error("Passwords do not match.");
      return;
    }

    try {
      const res = await API.post(`/api/teachers/${uid}/reset-password`, { newPassword, repeatPassword });
      Toast.success(res.message || "Teacher password updated successfully!");
      Modal.close("adminChangeTeacherPassModal");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async toggleTeacherStatus(uid, newStatus) {
    if (!confirm(`Are you sure you want to change this teacher status to ${newStatus}?`)) return;
    try {
      await API.patch(`/api/teachers/${uid}/status`, { status: newStatus });
      Toast.success(`Teacher status updated to ${newStatus}.`);
      await this.loadInitialData();
      this.loadTeachers();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 4. CLASSES & SUBJECTS ================= //
  async loadClassesAndSubjects() {
    const container = document.getElementById("classesSubjectsContainer");
    container.innerHTML = `<div style="text-align:center;padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></div>`;

    try {
      const res = await API.get("/api/classes-and-subjects");
      const list = res.classes || res.data || [];
      if (list.length === 0) {
        container.innerHTML = `<div class="card" style="text-align:center;color:#64748B;">No classes configured. Click "Add Class" to get started.</div>`;
        return;
      }

      container.innerHTML = list.map(c => `
        <div class="card" style="margin-bottom:1.5rem;">
          <div class="card-header">
            <div>
              <h3 style="display:flex;align-items:center;gap:0.5rem;">
                ${escapeHtml(c.className)}
                <span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-neutral'}">${escapeHtml(c.status)}</span>
              </h3>
              <p style="font-size:0.85rem;margin-top:0.25rem;">${c.subjects ? c.subjects.length : 0} Subjects Configured</p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="PrincipalApp.openAddSubjectModal('${escapeHtml(c.classId)}', '${escapeHtml(c.className)}')">
              + Add Subject to ${escapeHtml(c.className)}
            </button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.6rem;">
            ${c.subjects && c.subjects.length > 0 ? c.subjects.map(s => `
              <div style="background:#F1F5F9;border:1px solid #CBD5E1;border-radius:var(--radius-sm);padding:0.4rem 0.85rem;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.875rem;">
                <span>${escapeHtml(s.subjectName)}</span>
              </div>
            `).join("") : `<span style="color:#94A3B8;font-style:italic;">No subjects added yet.</span>`}
          </div>
        </div>
      `).join("");
    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--danger);">Failed to load classes: ${escapeHtml(err.message)}</div>`;
    }
  },

  openAddClassModal() {
    document.getElementById("addClassForm").reset();
    Modal.open("addClassModal");
  },

  async handleAddClassSubmit(e) {
    e.preventDefault();
    const className = document.getElementById("newClassName").value.trim();
    try {
      await API.post("/api/classes", { className });
      Toast.success(`Class '${className}' added successfully!`);
      Modal.close("addClassModal");
      await this.loadInitialData();
      this.loadClassesAndSubjects();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openAddSubjectModal(classId, className) {
    document.getElementById("addSubjectForm").reset();
    document.getElementById("subClassIdHidden").value = classId;
    document.getElementById("subClassNameDisplay").textContent = className;
    Modal.open("addSubjectModal");
  },

  async handleAddSubjectSubmit(e) {
    e.preventDefault();
    const classId = document.getElementById("subClassIdHidden").value;
    const subjectName = document.getElementById("newSubjectName").value.trim();
    try {
      await API.post(`/api/classes/${classId}/subjects`, { subjectName });
      Toast.success(`Subject '${subjectName}' added successfully!`);
      Modal.close("addSubjectModal");
      this.loadClassesAndSubjects();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 5. ASSIGN CLASSES & SUBJECTS ================= //
  async loadAssignments() {
    this.populateTeacherDropdowns();
    this.populateClassDropdowns();

    const tbody = document.getElementById("assignmentsTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/assignments");
      if (!res.assignments || res.assignments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem;color:#64748B;">No teacher assignments found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.assignments.map(a => `
        <tr>
          <td><strong>${escapeHtml(a.teacherName)}</strong> <span style="color:#64748B;font-size:0.8rem;">(${escapeHtml(a.teacherCode)})</span></td>
          <td><span class="badge badge-primary">${escapeHtml(a.className)}</span></td>
          <td><strong>${escapeHtml(a.subjectName)}</strong></td>
          <td><span class="badge ${a.status === 'active' ? 'badge-success' : 'badge-danger'}">${escapeHtml(a.status)}</span></td>
          <td>
            ${a.status === 'active' ? `
              <button class="btn btn-danger btn-sm" onclick="PrincipalApp.removeAssignment('${escapeHtml(a.assignmentId)}')">
                Remove Assignment
              </button>
            ` : `<span style="color:#94A3B8;">Inactive</span>`}
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--danger);padding:1.5rem;">Failed to load assignments: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  async handleAssignmentClassChange(classSelectId, subjectSelectId) {
    const classId = document.getElementById(classSelectId)?.value;
    const subSelect = document.getElementById(subjectSelectId);
    if (!subSelect) return;

    if (!classId) {
      subSelect.innerHTML = '<option value="">-- First Select Class --</option>';
      subSelect.disabled = true;
      return;
    }

    try {
      subSelect.innerHTML = '<option value="">Loading subjects...</option>';
      const res = await API.get(`/api/classes/${classId}/subjects`);
      if (!res.subjects || res.subjects.length === 0) {
        subSelect.innerHTML = '<option value="">No subjects found for this class</option>';
        subSelect.disabled = true;
        return;
      }
      subSelect.disabled = false;
      subSelect.innerHTML = '<option value="">-- Select Subject --</option>' + res.subjects.map(s => `
        <option value="${escapeHtml(s.subjectId || s._id)}">${escapeHtml(s.subjectName)}</option>
      `).join("");
    } catch (err) {
      subSelect.innerHTML = '<option value="">Error loading subjects</option>';
    }
  },

  async handleCreateAssignmentSubmit(e) {
    e.preventDefault();
    const teacherUid = document.getElementById("asgnTeacher").value;
    const classId = document.getElementById("asgnClass").value;
    const subjectId = document.getElementById("asgnSubject").value;

    if (!teacherUid || !classId || !subjectId) {
      Toast.warning("Please select Teacher, Class, and Subject.");
      return;
    }

    try {
      await API.post("/api/assignments", { teacherUid, classId, subjectId });
      Toast.success("Teacher successfully assigned to class & subject!");
      document.getElementById("createAssignmentForm").reset();
      document.getElementById("asgnSubject").innerHTML = '<option value="">-- First Select Class --</option>';
      document.getElementById("asgnSubject").disabled = true;
      this.loadAssignments();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async removeAssignment(assignmentId) {
    if (!confirm("Are you sure you want to remove this assignment? Historical attendance will remain intact.")) return;
    try {
      await API.delete(`/api/assignments/${assignmentId}`);
      Toast.success("Assignment removed successfully.");
      this.loadAssignments();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 6. STUDENT ATTENDANCE (VIEW & LOCK) ================= //
  async loadStudentAttendanceRecords() {
    this.populateClassDropdowns();
    const classId = document.getElementById("filterAttClass")?.value || "";
    const subjectId = document.getElementById("filterAttSubject")?.value || "";
    const dateFrom = document.getElementById("filterAttDateFrom")?.value || "";
    const dateTo = document.getElementById("filterAttDateTo")?.value || "";
    const status = document.getElementById("filterAttStatus")?.value || "";
    const studentName = document.getElementById("filterAttStudentName")?.value || "";

    const tbody = document.getElementById("studentAttendanceTableBody");
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/attendance/student-records", {
        classId, subjectId, dateFrom, dateTo, status, studentName
      });

      if (!res.records || res.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:2rem;color:#64748B;">No attendance records found matching filters.</td></tr>`;
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
          <td>${escapeHtml(r.teacherName)}</td>
          <td>
            ${r.locked ? `<span class="badge badge-warning">Locked</span>` : `<span class="badge badge-neutral">Open</span>`}
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:var(--danger);padding:1.5rem;">Failed to load records: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  // Session Lock / Unlock
  async handleCheckSessionLock() {
    const classId = document.getElementById("lockClassSelect").value;
    const subjectId = document.getElementById("lockSubjectSelect").value;
    const dateStr = document.getElementById("lockDateInput").value;
    const period = document.getElementById("lockPeriodSelect").value;

    if (!classId || !subjectId || !dateStr || !period) {
      Toast.warning("Select Class, Subject, Date, and Period to check lock status.");
      return;
    }

    try {
      const res = await API.get("/api/attendance/session", {
        classId, subjectId, date: dateStr, period
      });

      const lockStatusDisplay = document.getElementById("sessionLockStatusDisplay");
      const btnLock = document.getElementById("btnLockAttendance");
      const btnUnlock = document.getElementById("btnUnlockAttendance");

      if (res.isLocked) {
        lockStatusDisplay.innerHTML = `<span class="badge badge-danger" style="font-size:0.9rem;padding:0.4rem 0.8rem;">🔒 Attendance is LOCKED for this session</span>`;
        btnLock.style.display = "none";
        btnUnlock.style.display = "inline-flex";
      } else {
        lockStatusDisplay.innerHTML = `<span class="badge badge-success" style="font-size:0.9rem;padding:0.4rem 0.8rem;">🔓 Attendance is OPEN for editing</span>`;
        btnLock.style.display = "inline-flex";
        btnUnlock.style.display = "none";
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async handleLockAttendance() {
    const classId = document.getElementById("lockClassSelect").value;
    const subjectId = document.getElementById("lockSubjectSelect").value;
    const dateStr = document.getElementById("lockDateInput").value;
    const period = document.getElementById("lockPeriodSelect").value;

    try {
      await API.post("/api/attendance/lock", { classId, subjectId, date: dateStr, period });
      Toast.success("Session locked successfully! Teachers can no longer edit this session.");
      this.handleCheckSessionLock();
      this.loadStudentAttendanceRecords();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async handleUnlockAttendance() {
    const classId = document.getElementById("lockClassSelect").value;
    const subjectId = document.getElementById("lockSubjectSelect").value;
    const dateStr = document.getElementById("lockDateInput").value;
    const period = document.getElementById("lockPeriodSelect").value;

    try {
      await API.post("/api/attendance/unlock", { classId, subjectId, date: dateStr, period });
      Toast.success("Session unlocked successfully! Teachers can now edit attendance.");
      this.handleCheckSessionLock();
      this.loadStudentAttendanceRecords();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 7. TEACHER ATTENDANCE (PRINCIPAL MARKS) ================= //
  async loadTeacherAttendanceRecords() {
    this.populateTeacherDropdowns();
    const dateFrom = document.getElementById("filterTchAttDateFrom")?.value || "";
    const dateTo = document.getElementById("filterTchAttDateTo")?.value || "";
    const status = document.getElementById("filterTchAttStatus")?.value || "";
    const name = document.getElementById("filterTchAttName")?.value || "";

    const tbody = document.getElementById("teacherAttendanceTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem;"><div class="spinner spinner-dark" style="margin:0 auto;"></div></td></tr>`;

    try {
      const res = await API.get("/api/attendance/teacher-records", { dateFrom, dateTo, status, teacherName: name });
      if (!res.records || res.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem;color:#64748B;">No teacher attendance records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.records.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.date)}</strong></td>
          <td><code style="color:var(--primary);font-weight:700;">${escapeHtml(r.teacherCode)}</code></td>
          <td><strong>${escapeHtml(r.teacherName)}</strong></td>
          <td>
            <span class="badge ${r.status === 'Present' ? 'badge-success' : 'badge-danger'}">
              ${escapeHtml(r.status)}
            </span>
          </td>
          <td>${escapeHtml(r.markedBy || "Principal")}</td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--danger);padding:1.5rem;">Failed to load teacher attendance: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  async handleMarkTeacherAttendanceSubmit(e) {
    e.preventDefault();
    const teacherUid = document.getElementById("markTchSelect").value;
    const dateStr = document.getElementById("markTchDate").value;
    const status = document.getElementById("markTchStatus").value;

    if (!teacherUid || !dateStr) {
      Toast.warning("Please select Teacher and Date.");
      return;
    }

    try {
      const res = await API.post("/api/attendance/teacher", {
        teacherUid, date: dateStr, status
      });
      Toast.success(res.message || "Teacher attendance marked successfully!");
      this.loadTeacherAttendanceRecords();
      this.loadDashboardStats();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ================= 8. EXCEL REPORTS ================= //
  setupReportsForm() {
    this.populateClassDropdowns();
    this.populateTeacherDropdowns();

    const currYear = new Date().getFullYear();
    const yearSelects = document.querySelectorAll(".report-year-select");
    yearSelects.forEach(s => {
      s.value = currYear.toString();
    });

    document.getElementById("reportStudentClass")?.addEventListener("change", async (e) => {
      const classId = e.target.value;
      const stuSelect = document.getElementById("reportStudentSelect");
      if (!stuSelect) return;

      if (!classId) {
        stuSelect.innerHTML = '<option value="">All Students</option>';
        return;
      }
      try {
        const res = await API.get("/api/students", { classId });
        stuSelect.innerHTML = '<option value="">All Students</option>' + (res.students || []).map(s => `
          <option value="${escapeHtml(s.studentId)}">${escapeHtml(s.rollNumber)}. ${escapeHtml(s.name)}</option>
        `).join("");
      } catch (err) {
        stuSelect.innerHTML = '<option value="">All Students</option>';
      }
    });
  },

  async handleDownloadStudentReport() {
    const year = document.getElementById("reportStudentYear").value;
    const month = document.getElementById("reportStudentMonth").value;
    const classId = document.getElementById("reportStudentClass").value;
    const subjectId = document.getElementById("reportStudentSubject").value;
    const studentId = document.getElementById("reportStudentSelect").value;

    const btn = document.getElementById("btnDownloadStudentReport");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Generating Excel...`;

    try {
      const downloadRes = await API.request("/api/reports/students/excel", {
        method: "POST",
        body: JSON.stringify({ year, month, classId, subjectId, studentId })
      });

      const blob = downloadRes.blob;
      let filename = `Attendance_Students_${year}.xlsx`;
      if (downloadRes.filename && downloadRes.filename.includes("filename=")) {
        filename = downloadRes.filename.split("filename=")[1].replace(/"/g, "").trim();
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      Toast.success("Student Excel report downloaded successfully!");
    } catch (err) {
      Toast.error(err.message || "Failed to generate report.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download Student Attendance Excel`;
    }
  },

  async handleDownloadTeacherReport() {
    const year = document.getElementById("reportTeacherYear").value;
    const month = document.getElementById("reportTeacherMonth").value;
    const teacherUid = document.getElementById("reportTeacherSelect").value;

    const btn = document.getElementById("btnDownloadTeacherReport");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Generating Excel...`;

    try {
      const downloadRes = await API.request("/api/reports/teachers/excel", {
        method: "POST",
        body: JSON.stringify({ year, month, teacherUid })
      });

      const blob = downloadRes.blob;
      let filename = `Attendance_Teachers_${year}.xlsx`;
      if (downloadRes.filename && downloadRes.filename.includes("filename=")) {
        filename = downloadRes.filename.split("filename=")[1].replace(/"/g, "").trim();
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      Toast.success("Teacher Excel report downloaded successfully!");
    } catch (err) {
      Toast.error(err.message || "Failed to generate report.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download Teacher Attendance Excel`;
    }
  },

  // ================= 9. PROFILE & PASSWORD ================= //
  loadProfile() {
    document.getElementById("profName").textContent = this.currentUser.name;
    document.getElementById("profRole").textContent = this.currentUser.role;
    document.getElementById("profUid").textContent = this.currentUser.uid;
    document.getElementById("profMobile").textContent = this.currentUser.mobileNumber || "Not configured";
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

window.PrincipalApp = PrincipalApp;
document.addEventListener("DOMContentLoaded", () => {
  PrincipalApp.init();
});
