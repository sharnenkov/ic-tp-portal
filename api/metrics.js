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

async function countActiveMembersLastDays(repoPath, days = 2) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const authors = new Set();

  try {
    // 1. Коммиты
    const commits = await fetchGitHub(`/repos/${repoPath}/commits?per_page=100`);
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

    // 2. Комментарии в issues
    const issueComments = await fetchGitHub(`/repos/${repoPath}/issues/comments?per_page=100&sort=updated&direction=desc`);
    (issueComments || []).forEach(comment => {
      try {
        const date = new Date(comment.updated_at);
        if (date > cutoff) {
          const author = comment.user?.login;
          if (author) authors.add(author);
        }
      } catch {
        // skip
      }
    });

    // 3. Комментарии в PR
    const prComments = await fetchGitHub(`/repos/${repoPath}/pulls/comments?per_page=100&sort=updated&direction=desc`);
    (prComments || []).forEach(comment => {
      try {
        const date = new Date(comment.updated_at);
        if (date > cutoff) {
          const author = comment.user?.login;
          if (author) authors.add(author);
        }
      } catch {
        // skip
      }
    });
  } catch (err) {
    console.warn('Ошибка при подсчёте активных участников:', err);
  }

  // Исключаем ботов из подсчёта реальных участников
  const botPatterns = ['bot', 'bot-', '[bot]', '-bot', 'action', 'claude', 'ai-'];
  const humanAuthors = Array.from(authors).filter(author =>
    !botPatterns.some(pattern => author.toLowerCase().includes(pattern))
  );

  console.log(`\n🚨 АКТИВНЫЕ УЧАСТНИКИ (${days} дней): ${humanAuthors.length} человек`);
  console.log('Имена:', humanAuthors.join(', '));
  console.log(`\n`);
  return { count: humanAuthors.length, names: humanAuthors, allAuthors: Array.from(authors) };
}

// ── Helpers для идеал-ориентированных метрик ──────────────────────

async function fileExists(repoPath, path) {
  const r = await fetchGitHub(`/repos/${repoPath}/contents/${path}`);
  return r && r.length > 0;
}

async function dirCount(repoPath, path) {
  const r = await fetchGitHub(`/repos/${repoPath}/contents/${path}`);
  return (r && Array.isArray(r)) ? r.length : 0;
}

// Дата последнего коммита, затронувшего path (null если нет)
async function lastCommitDate(repoPath, path) {
  const commits = await fetchGitHub(`/repos/${repoPath}/commits?path=${encodeURIComponent(path)}&per_page=1`);
  const d = commits?.[0]?.commit?.author?.date;
  return d ? new Date(d) : null;
}

function daysAgo(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / 86400000;
}

// Прогресс чекбоксов в markdown-файле: {done, total}
async function checkboxProgress(repoPath, path) {
  try {
    const r = await fetchGitHub(`/repos/${repoPath}/contents/${path}`);
    const content = r?.[0]?.content;
    if (!content) return { done: 0, total: 0 };
    const text = Buffer.from(content, 'base64').toString('utf-8');
    const done = (text.match(/- \[x\]/gi) || []).length;
    const total = done + (text.match(/- \[ \]/g) || []).length;
    return { done, total };
  } catch {
    return { done: 0, total: 0 };
  }
}

// Dynamic metrics calculation
async function calculateDocumentation(repoPath) {
  // Идеал (100): описаны все сущности (глоссарий + граф знаний), системы,
  // процессы и онбординг; документация свежая. 100 — это идеал, не «файлы есть».
  let score = 10;

  try {
    if (await fileExists(repoPath, 'README.md')) score += 10;
    if (await fileExists(repoPath, 'CONTRIBUTING.md')) score += 10;
    if (await fileExists(repoPath, 'ONBOARDING.md')) score += 5;
    if ((await dirCount(repoPath, 'docs')) >= 4) score += 10;
    if (await fileExists(repoPath, 'docs/ARCHITECTURE.md')) score += 10;
    if (await fileExists(repoPath, 'docs/README.md')) score += 5;

    // Все сущности и термины проекта описаны (словарь)
    if (await fileExists(repoPath, 'docs/GLOSSARY.md') || await fileExists(repoPath, 'GLOSSARY.md')) score += 15;

    // Граф знаний формализован и находится в main (решение АР-4 от 22.06)
    if (await fileExists(repoPath, 'graph') || await fileExists(repoPath, 'SCHEMA.md') || await fileExists(repoPath, 'entities.yaml')) score += 15;

    // Документация живая: docs/ обновлялись за последние 30 дней
    if (daysAgo(await lastCommitDate(repoPath, 'docs')) <= 30) score += 10;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateKnowledgeManagement(repoPath) {
  // Идеал (100): знания фиксируются (решения, инсайты, протоколы),
  // переиспользуются (образцы, FAQ) и практика рефлексии ЖИВАЯ, а не разовая.
  let score = 10;

  try {
    if (await fileExists(repoPath, 'log/decisions.md')) score += 10;
    if (await fileExists(repoPath, 'log/insights.md')) score += 5;
    if (await fileExists(repoPath, 'CHANGELOG.md')) score += 10;
    if ((await dirCount(repoPath, 'examples')) >= 2) score += 10;

    // Протоколы встреч архивируются в log/
    if ((await dirCount(repoPath, 'log')) >= 5) score += 10;

    // Практика рефлексии: папки участников есть...
    if ((await dirCount(repoPath, 'reflections')) >= 3) score += 10;
    // ...и практика живая — свежая рефлексия за последние 7 дней
    if (daysAgo(await lastCommitDate(repoPath, 'reflections')) <= 7) score += 15;

    // Журнал решений живой: обновлялся за последние 14 дней
    if (daysAgo(await lastCommitDate(repoPath, 'log/decisions.md')) <= 14) score += 10;

    // Накопленные вопросы оформлены в FAQ
    if (await fileExists(repoPath, 'docs/FAQ.md')) score += 10;
  } catch (e) {
    // Ignore 404s
  }

  return Math.min(100, score);
}

async function calculateAutomationQuality(repoPath) {
  // Идеал (100): вся автоматизация работает на целевом (суверенном) стеке,
  // планы дорожной карты доведены до финала, скрипты покрыты тестами,
  // агенты самонастраиваются и всё задокументировано.
  // Прогресс к идеалу считается по чекбоксам дорожной карты в docs/AUTOMATION.md.
  let score = 10;

  try {
    // База: автоматизация существует и логика вынесена в скрипты (не inline в yml)
    if ((await dirCount(repoPath, '.github/workflows')) >= 2) score += 10;
    if ((await dirCount(repoPath, '.github/scripts')) >= 1) score += 10;

    // Агенты самонастраиваются: инструкции читаются автоматически
    if (await fileExists(repoPath, 'CLAUDE.md')) score += 10;

    // Автоматизация задокументирована: реестр + стандарт + Страж
    if (await fileExists(repoPath, 'docs/AUTOMATION.md')) score += 10;
    if (await fileExists(repoPath, 'docs/GUARDIAN.md')) score += 5;
    if ((await dirCount(repoPath, 'examples')) >= 2) score += 5;

    // Скрипты покрыты тестами (можно менять без страха сломать)
    const scriptFiles = await fetchGitHub(`/repos/${repoPath}/contents/.github/scripts`);
    const hasTests = Array.isArray(scriptFiles) &&
      scriptFiles.some(f => (f.name || '').startsWith('test_') || f.name === 'tests');
    if (hasTests) score += 15;

    // Дорожная карта к идеалу: доля выполненных пунктов в docs/AUTOMATION.md
    const roadmap = await checkboxProgress(repoPath, 'docs/AUTOMATION.md');
    if (roadmap.total > 0) {
      score += Math.round(25 * roadmap.done / roadmap.total);
    }
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
    const [docScore, kmScore, cqScore, archScore, sysScore, activeMembersData] = await Promise.all([
      calculateDocumentation(REPO),
      calculateKnowledgeManagement(REPO),
      calculateAutomationQuality(REPO),
      calculateArchitectureQuality(REPO),
      calculateSystemReliability(commits),
      countActiveMembersLastDays(REPO, 2)
    ]);

    const activeMembers = activeMembersData.count;

    const metrics = {
      timestamp: new Date().toISOString(),
      documentation: { score: docScore },
      knowledge_management: { score: kmScore },
      guardian_rules: {
        violations,
        score: calculateGuardianScore(violations)
      },
      // Ключ codeQuality сохранён для совместимости с клиентом; семантика — качество автоматизации
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
        active_members: activeMembers,
        active_members_names: activeMembersData.names,
        score: calculateTeamCoordinationScore(activeMembers)
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
    console.log(`  ⚙️ Качество автоматизации: ${metrics.codeQuality.score}`);
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
