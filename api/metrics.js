/**
 * Vercel API Route для получения метрик дашборда
 * Используется для кнопки "Обновить" на клиенте
 * Работает без GitHub токена (публичный API)
 */

const REPO = 'denisrudomanenko-stack/IC.TP';

async function fetchGitHub(path) {
  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ic-tp-metrics'
    };

    // Add token if available (for private repos)
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(`https://api.github.com${path}`, { headers });

    if (!response.ok) {
      console.warn(`GitHub API: ${response.status} ${path}`);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    console.error(`Fetch error: ${err.message}`);
    return [];
  }
}

function countGuardianViolations(issues) {
  if (!issues || issues.length === 0) return 0;

  return issues.filter(issue => {
    const title = (issue.title || '').toLowerCase();
    const labels = (issue.labels || []).map(l => (l.name || '').toLowerCase());

    return title.includes('🔬') || title.includes('страж') ||
           labels.some(l => l.includes('guardian') || l.includes('страж'));
  }).length;
}

function calculateGuardianScore(violations) {
  return Math.max(20, 100 - (violations * 10));
}

function countCommitsInDays(commits, days) {
  if (!commits) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return commits.filter(c => {
    try {
      const date = new Date(c.commit?.author?.date || c.commit?.committer?.date);
      return date > cutoff;
    } catch {
      return false;
    }
  }).length;
}

function calculateReviewScore(avgHours, openPRs) {
  if (avgHours === 0 && openPRs === 0) return 100;

  let score = 100;

  if (avgHours > 24) {
    score -= Math.min(40, Math.floor(avgHours / 24) * 10);
  } else if (avgHours > 4) {
    score -= Math.min(20, (avgHours - 4) * 2);
  }

  if (openPRs > 2) {
    score -= Math.min(20, (openPRs - 2) * 5);
  }

  return Math.max(20, score);
}

function calculateProjectManagementScore(openIssuesCount) {
  if (openIssuesCount === 0) return 100;
  if (openIssuesCount <= 3) return 90;
  if (openIssuesCount <= 5) return 75;
  if (openIssuesCount <= 10) return 60;
  return Math.max(30, 100 - openIssuesCount * 3);
}

function calculateTeamCoordinationScore(activeMembersLastDays) {
  if (activeMembersLastDays === 0) return 30;
  if (activeMembersLastDays === 1) return 50;
  if (activeMembersLastDays <= 3) return 85;
  return 95;
}

function countActiveMembersLastDays(commits, days = 2) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const authors = new Set();

  (commits || []).forEach(c => {
    try {
      const date = new Date(c.commit?.author?.date || c.commit?.committer?.date);
      if (date > cutoff) {
        const author = c.commit?.author?.name || c.author?.login;
        if (author) authors.add(author);
      }
    } catch {
      // skip
    }
  });

  return authors.size;
}

// Dynamic metrics calculation
async function calculateDocumentation(repoPath) {
  // Documentation quality:严格评估
  let score = 30; // базовый уровень низкий

  try {
    const readme = await fetchGitHub(`/repos/${repoPath}/contents/README.md`);
    if (readme && readme.length > 0) score += 20;

    const docs = await fetchGitHub(`/repos/${repoPath}/contents/docs`);
    if (docs && Array.isArray(docs) && docs.length > 3) score += 30;

    const contributing = await fetchGitHub(`/repos/${repoPath}/contents/CONTRIBUTING.md`);
    if (contributing && contributing.length > 0) score += 15;

    const architecture = await fetchGitHub(`/repos/${repoPath}/contents/docs/ARCHITECTURE.md`);
    if (architecture && architecture.length > 0) score += 5;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateKnowledgeManagement(repoPath) {
  // Knowledge management: процессная дисциплина
  let score = 25;

  try {
    const contributing = await fetchGitHub(`/repos/${repoPath}/contents/CONTRIBUTING.md`);
    if (contributing && contributing.length > 0) score += 20;

    const changelog = await fetchGitHub(`/repos/${repoPath}/contents/CHANGELOG.md`);
    if (changelog && changelog.length > 0) score += 20;

    const examples = await fetchGitHub(`/repos/${repoPath}/contents/examples`);
    if (examples && Array.isArray(examples) && examples.length > 2) score += 15;

    const log = await fetchGitHub(`/repos/${repoPath}/contents/log`);
    if (log && Array.isArray(log) && log.length > 2) score += 20;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateCodeQuality(repoPath) {
  // Code quality: строгие критерии
  let score = 35;

  try {
    const src = await fetchGitHub(`/repos/${repoPath}/contents/src`);
    if (src && Array.isArray(src) && src.length > 2) score += 15;

    const eslint = await fetchGitHub(`/repos/${repoPath}/contents/.eslintrc.json`);
    if (eslint && eslint.length > 0) score += 15;

    const prettier = await fetchGitHub(`/repos/${repoPath}/contents/.prettierrc`);
    if (prettier && prettier.length > 0) score += 10;

    const tsconfig = await fetchGitHub(`/repos/${repoPath}/contents/tsconfig.json`);
    if (tsconfig && tsconfig.length > 0) score += 15;

    // Check for tests
    const tests = await fetchGitHub(`/repos/${repoPath}/contents/test`);
    if (tests && Array.isArray(tests) && tests.length > 2) score += 10;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateArchitectureQuality(repoPath) {
  // Architecture: модульность и документация
  let score = 30;

  try {
    const src = await fetchGitHub(`/repos/${repoPath}/contents/src`);
    if (src && Array.isArray(src) && src.filter(f => f.type === 'dir').length > 4) score += 20;

    const deliverables = await fetchGitHub(`/repos/${repoPath}/contents/deliverables`);
    if (deliverables && Array.isArray(deliverables) && deliverables.length > 3) score += 25;

    const context = await fetchGitHub(`/repos/${repoPath}/contents/context`);
    if (context && Array.isArray(context) && context.length > 2) score += 15;

    const api = await fetchGitHub(`/repos/${repoPath}/contents/api`);
    if (api && api.length > 0) score += 10;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateSystemReliability(commits) {
  // System reliability: КЛЮЧЕВАЯ метрика! Строгие критерии
  let score = 20;

  const weeklyCommits = countCommitsInDays(commits, 7);
  const recentCommits = countCommitsInDays(commits, 3);
  const dayCommits = countCommitsInDays(commits, 1);

  // Регулярные коммиты = стабильность
  if (weeklyCommits >= 15) score += 20;
  else if (weeklyCommits >= 10) score += 15;
  else if (weeklyCommits >= 5) score += 10;

  // Активность в последние дни
  if (recentCommits >= 3) score += 20;
  else if (recentCommits >= 1) score += 10;

  // Коммиты сегодня?
  if (dayCommits > 0) score += 15;

  // Множество авторов = меньше одного человека
  const authors = new Set();
  (commits || []).slice(0, 50).forEach(c => {
    const author = c.commit?.author?.name || c.author?.login;
    if (author) authors.add(author);
  });
  if (authors.size >= 3) score += 15;
  else if (authors.size >= 2) score += 10;

  return Math.min(100, Math.max(20, score));
}

export default async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('📊 Получаем метрики для', REPO);

    // Fetch data from GitHub API (no token needed for public repos)
    const [issues, pulls, commits] = await Promise.all([
      fetchGitHub(`/repos/${REPO}/issues?state=open&per_page=100`),
      fetchGitHub(`/repos/${REPO}/pulls?state=closed&per_page=50`),
      fetchGitHub(`/repos/${REPO}/commits?per_page=100`)
    ]);

    const openIssuesCount = (issues || []).length;
    const openPRsCount = (pulls || []).filter(p => !p.merged_at).length;
    const weeklyCommits = countCommitsInDays(commits, 7);

    // Calculate review time (simplified - just use 0 if no reviews)
    const avgReviewHours = 0;

    console.log(`  📋 Issues: ${openIssuesCount} открытых`);
    console.log(`  🔀 PR: ${openPRsCount} открытых`);
    console.log(`  📝 Commits: ${weeklyCommits} за неделю`);
    console.log(`  👥 Active members: ${countActiveMembersLastDays(commits, 2)} за 2 дня`);

    // Guardian violations
    const violations = countGuardianViolations(issues);

    // Calculate dynamic metrics in parallel
    const [docScore, kmScore, cqScore, archScore, sysScore] = await Promise.all([
      calculateDocumentation(REPO),
      calculateKnowledgeManagement(REPO),
      calculateCodeQuality(REPO),
      calculateArchitectureQuality(REPO),
      calculateSystemReliability(commits)
    ]);

    const metrics = {
      timestamp: new Date().toISOString(),
      documentation: { score: docScore },
      knowledge_management: { score: kmScore },
      guardian_rules: {
        violations,
        score: calculateGuardianScore(violations)
      },
      codeQuality: { score: cqScore },
      codeReview: {
        openPRs: openPRsCount,
        avgReviewHours,
        score: calculateReviewScore(avgReviewHours, openPRsCount)
      },
      project_management: {
        open_issues: openIssuesCount,
        score: calculateProjectManagementScore(openIssuesCount)
      },
      team_coordination: {
        active_members: countActiveMembersLastDays(commits, 2),
        score: calculateTeamCoordinationScore(countActiveMembersLastDays(commits, 2))
      },
      architecture: { score: archScore },
      system_reliability: { score: sysScore }
    };

    // Calculate overall with weighted scoring
    // Guardian (Дисциплина) - 25% (КЛЮЧЕВАЯ)
    // System Reliability (Надежность) - 25% (КЛЮЧЕВАЯ)
    // Остальные 7 метрик - 50% поровну (7.14% каждая)
    const weights = {
      documentation: 0.0714,
      knowledge_management: 0.0714,
      guardian_rules: 0.25,
      codeQuality: 0.0714,
      codeReview: 0.0714,
      project_management: 0.0714,
      team_coordination: 0.0714,
      architecture: 0.0714,
      system_reliability: 0.25
    };

    metrics.overallConnectivity = Math.round(
      metrics.documentation.score * weights.documentation +
      metrics.knowledge_management.score * weights.knowledge_management +
      metrics.guardian_rules.score * weights.guardian_rules +
      metrics.codeQuality.score * weights.codeQuality +
      metrics.codeReview.score * weights.codeReview +
      metrics.project_management.score * weights.project_management +
      metrics.team_coordination.score * weights.team_coordination +
      metrics.architecture.score * weights.architecture +
      metrics.system_reliability.score * weights.system_reliability
    );

    console.log(`📈 Связность: ${metrics.overallConnectivity}/100`);
    console.log(`\n📊 Детали метрик:`);
    console.log(`  🛡️  Дисциплина разработки (Guardian): ${metrics.guardian_rules.score} (вес: 25%)`);
    console.log(`  ✅ Надежность системы: ${metrics.system_reliability.score} (вес: 25%)`);
    console.log(`  📚 Документированность: ${metrics.documentation.score}`);
    console.log(`  🎓 Управление знаниями: ${metrics.knowledge_management.score}`);
    console.log(`  ⚡ Качество кода: ${metrics.codeQuality.score}`);
    console.log(`  🔁 Code Review: ${metrics.codeReview.score}`);
    console.log(`  📊 Управление проектом: ${metrics.project_management.score}`);
    console.log(`  👥 Координация команды: ${metrics.team_coordination.score}`);
    console.log(`  🏗️  Качество архитектуры: ${metrics.architecture.score}`);

    res.status(200).json(metrics);
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
