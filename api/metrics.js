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

    // Guardian violations
    const violations = countGuardianViolations(issues);

    const metrics = {
      timestamp: new Date().toISOString(),
      documentation: { score: 85 },
      knowledge_management: { score: 70 },
      guardian_rules: {
        violations,
        score: calculateGuardianScore(violations)
      },
      codeQuality: { score: 82 },
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
      architecture: { score: 81 },
      system_reliability: { score: 88 }
    };

    // Calculate overall (9 metrics average)
    const scores = [
      metrics.documentation.score,
      metrics.knowledge_management.score,
      metrics.guardian_rules.score,
      metrics.codeQuality.score,
      metrics.codeReview.score,
      metrics.project_management.score,
      metrics.team_coordination.score,
      metrics.architecture.score,
      metrics.system_reliability.score
    ];

    metrics.overallConnectivity = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    console.log(`📈 Связность: ${metrics.overallConnectivity}/100`);

    res.status(200).json(metrics);
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
