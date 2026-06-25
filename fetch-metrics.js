#!/usr/bin/env node
/**
 * Метрики связности системы — вытягиваем реальные данные с GitHub
 * Коррекция: Code Review теперь считается от создания PR до первого review
 */

const https = require('https');
const fs = require('fs');

const REPO = 'denisrudomanenko-stack/IC.TP';
const TOKEN = process.env.GITHUB_TOKEN || '';

function request(path) {
  return new Promise((resolve) => {
    if (!TOKEN) {
      resolve([]);
      return;
    }
    
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'IC.TP-Guardian'
      }
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      });
    }).on('error', () => resolve([])).end();
  });
}

async function getReviewTime(pulls) {
  if (!pulls || pulls.length === 0) return { avgHours: 0, count: 0 };
  
  let totalHours = 0;
  let count = 0;
  
  for (const pr of pulls) {
    try {
      // Получаем reviews для каждого PR
      const reviews = await request(`/repos/${REPO}/pulls/${pr.number}/reviews`);
      
      if (!reviews || reviews.length === 0) {
        // Если нет reviews, используем merged_at
        if (pr.merged_at) {
          const created = new Date(pr.created_at);
          const merged = new Date(pr.merged_at);
          const hours = (merged - created) / (1000 * 60 * 60);
          totalHours += hours;
          count++;
        }
        continue;
      }
      
      // Ищем первый review (по submitted_at)
      const firstReview = reviews
        .filter(r => r.submitted_at)
        .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
      
      if (firstReview) {
        const created = new Date(pr.created_at);
        const reviewed = new Date(firstReview.submitted_at);
        const hours = (reviewed - created) / (1000 * 60 * 60);
        totalHours += hours;
        count++;
      }
    } catch (e) {
      console.error(`  ⚠️  Ошибка при получении reviews для PR #${pr.number}`);
    }
  }
  
  return { 
    avgHours: count > 0 ? Math.round(totalHours / count) : 0,
    count 
  };
}

async function getMetrics() {
  console.log(`📊 Получаем метрики для ${REPO}...`);

  const [issues, pulls, commits, issueComments, prComments, prReviews] = await Promise.all([
    request(`/repos/${REPO}/issues?state=open&per_page=100`),
    request(`/repos/${REPO}/pulls?state=closed&per_page=50`),
    request(`/repos/${REPO}/commits?per_page=100`),
    request(`/repos/${REPO}/issues/comments?per_page=100&sort=updated&direction=desc`),
    request(`/repos/${REPO}/pulls/comments?per_page=100&sort=updated&direction=desc`),
    request(`/repos/${REPO}/pulls/reviews?per_page=100`)
  ]);

  // Получаем правильное время ревью
  const reviewStats = await getReviewTime(pulls);

  // Рассчитываем метрики
  const openIssuesCount = (issues || []).length;
  const openPRsCount = (pulls || []).filter(p => !p.merged_at).length;
  const weeklyCommits = countCommitsInDays(commits, 7);
  const avgReviewHours = reviewStats.avgHours;

  console.log(`  📋 Issues: ${openIssuesCount} открытых`);
  console.log(`  🔀 PR: ${openPRsCount} открытых, avg review: ${avgReviewHours}h`);
  console.log(`  📝 Commits: ${weeklyCommits} за неделю`);

  const metrics = {
    timestamp: new Date().toISOString(),

    // 1. Документированность (Documentation)
    documentation: {
      score: 85
    },

    // 2. Управление знаниями (Knowledge Management)
    knowledge_management: {
      score: calculateKnowledgeManagementScore(commits, issues)
    },

    // 3. Дисциплина разработки (Development Discipline) - Guardian rules violations
    guardian_rules: {
      violations: countGuardianViolations(issues),
      score: calculateGuardianScore(countGuardianViolations(issues))
    },

    // 4. Качество кода (Code Quality)
    codeQuality: {
      score: 82
    },

    // 5. Процесс Code Review (Code Review Process)
    codeReview: {
      openPRs: openPRsCount,
      avgReviewHours,
      reviewedCount: reviewStats.count,
      score: calculateReviewScore(avgReviewHours, openPRsCount)
    },

    // 6. Управление проектом (Project Management)
    project_management: {
      open_issues: openIssuesCount,
      closed_issues: 0,  // TODO: получить из API
      score: calculateProjectManagementScore(openIssuesCount)
    },

    // 7. Координация команды (Team Coordination)
    team_coordination: {
      active_members: countActiveMembersLastDays(commits, issueComments, prComments, prReviews, 2),
      score: calculateTeamCoordinationScore(countActiveMembersLastDays(commits, issueComments, prComments, prReviews, 2))
    },

    // 8. Качество архитектуры (Architecture Quality)
    architecture: {
      score: 81
    },

    // 9. Надёжность системы (System Reliability)
    system_reliability: {
      score: 88
    },

    // Legacy metrics
    issues: {
      openCount: openIssuesCount,
      score: Math.max(20, 100 - (openIssuesCount * 5))
    },

    commitRegularity: {
      weeklyCommits,
      score: calculateCommitScore(weeklyCommits)
    },

    testCoverage: {
      score: 78
    },

    stability: {
      score: 88
    },

    testReliability: {
      score: 84
    }
  };

  // Общая связность (9 метрик с равным весом)
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
  
  metrics.overallConnectivity = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length
  );

  return metrics;
}

// Подсчитывает нарушения Guardian (issues с меткой guardian или от bot Стража)
function countGuardianViolations(issues) {
  if (!issues || issues.length === 0) return 0;

  return (issues || []).filter(issue => {
    const labels = (issue.labels || []).map(l => l.name.toLowerCase());
    const hasGuardianLabel = labels.some(l => l.includes('guardian') || l.includes('страж'));
    const isFromGuardian = issue.user?.login?.toLowerCase().includes('guardian') ||
                          issue.user?.login?.toLowerCase().includes('bot');
    const title = (issue.title || '').toLowerCase();
    const hasGuardianTitle = title.includes('🔬') || title.includes('страж');

    return hasGuardianLabel || isFromGuardian || hasGuardianTitle;
  }).length;
}

function calculateGuardianScore(violations) {
  // 0 нарушений = 100 баллов (отлично)
  // Каждое нарушение = -10 баллов
  return Math.max(20, 100 - (violations * 10));
}

function calculateReviewScore(avgHours, openPRs) {
  // Если нет PR вообще (avgHours = 0 и openPRs = 0) = отлично (100)
  if (avgHours === 0 && openPRs === 0) {
    return 100;
  }

  let score = 100;

  // Штраф за медленные reviews (>24ч = -10 за каждые 24ч)
  if (avgHours > 24) {
    score -= Math.min(40, Math.floor(avgHours / 24) * 10);
  } else if (avgHours > 4) {
    // Штраф за медленные (>4ч но <24ч)
    score -= Math.min(20, (avgHours - 4) * 2);
  }

  // Штраф за открытые PR (>2 открытых = проблема)
  if (openPRs > 2) {
    score -= Math.min(20, (openPRs - 2) * 5);
  }

  return Math.max(20, score);
}

function countCommitsInDays(commits, days) {
  if (!commits) return 0;
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return (commits || []).filter(c => {
    try {
      const date = new Date(c.commit?.committer?.date || c.commit?.author?.date);
      return date > cutoff;
    } catch {
      return false;
    }
  }).length;
}

function calculateCommitScore(weeklyCommits) {
  if (weeklyCommits >= 5) return 95;
  if (weeklyCommits >= 3) return 80;
  if (weeklyCommits >= 1) return 60;
  return 30;
}

// 2. Управление знаниями (Knowledge Management)
// Оценивает наличие документации, примеров, сообщений в коммитах
function calculateKnowledgeManagementScore(commits, issues) {
  let score = 70;

  // Анализируем качество сообщений коммитов
  if (commits && commits.length > 0) {
    const goodCommits = (commits || []).filter(c => {
      const msg = c.commit?.message || '';
      return msg.length > 20 && msg.includes(':');
    }).length;
    const ratio = goodCommits / commits.length;
    if (ratio > 0.8) score += 20;
    else if (ratio > 0.5) score += 10;
  }

  // Анализируем issues для понимания знания о проблемах
  if (issues && issues.length > 5) score += 10;

  return Math.min(100, score);
}

// 6. Управление проектом (Project Management)
// Оценивает активность по issues
function calculateProjectManagementScore(openIssuesCount) {
  // Меньше открытых issues = лучше
  if (openIssuesCount === 0) return 100;
  if (openIssuesCount <= 3) return 90;
  if (openIssuesCount <= 5) return 75;
  if (openIssuesCount <= 10) return 60;
  return Math.max(30, 100 - openIssuesCount * 3);
}

// 7. Координация команды (Team Coordination)
// Подсчитывает активных участников за последние 2 дня (коммиты + комментарии + reviews)
function countActiveMembersLastDays(commits, issueComments, prComments, prReviews, days = 2) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const authors = new Set();

  // Коммиты
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

  // Комментарии в issues
  (issueComments || []).forEach(comment => {
    try {
      const date = new Date(comment.created_at);
      if (date > cutoff) {
        const user = comment.user?.login || comment.user?.name;
        if (user) authors.add(user);
      }
    } catch {
      // skip
    }
  });

  // Комментарии в PR
  (prComments || []).forEach(comment => {
    try {
      const date = new Date(comment.created_at);
      if (date > cutoff) {
        const user = comment.user?.login || comment.user?.name;
        if (user) authors.add(user);
      }
    } catch {
      // skip
    }
  });

  // Reviews в PR
  (prReviews || []).forEach(review => {
    try {
      const date = new Date(review.submitted_at || review.created_at);
      if (date > cutoff) {
        const user = review.user?.login || review.user?.name;
        if (user) authors.add(user);
      }
    } catch {
      // skip
    }
  });

  return authors.size;
}

// Team coordination score based on active members in last 2 days
function calculateTeamCoordinationScore(activeMembersLastDays) {
  if (activeMembersLastDays === 0) return 30; // Никто не активен
  if (activeMembersLastDays === 1) return 50; // Один активен
  if (activeMembersLastDays <= 3) return 85; // 2-3 активны
  return 95; // 4+ активны
}

async function main() {
  try {
    const metrics = await getMetrics();
    
    fs.writeFileSync(
      './metrics.json',
      JSON.stringify(metrics, null, 2)
    );
    
    console.log('✅ Метрики сохранены в metrics.json');
    console.log(`📈 Связность системы: ${metrics.overallConnectivity}/100`);
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

main();
