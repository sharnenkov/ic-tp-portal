# AGENT_PROTOCOL.md — Протокол идентификации агентов

> Справочник для агентов (Claude, GitHub Actions и других) как правильно подписывать свою работу

---

## 📋 Правило: Идентификация в каждом коммите

Каждый коммит ОБЯЗАН содержать три поля идентификации:

```
Operator: [кто запустил агента / кто утвердил]
Agent: [какой агент выполнял работу]
Intent: [зачем / в контексте какой задачи]
```

---

## ✅ Примеры ПРАВИЛЬНЫХ коммитов

### Пример 1: Агент Claude добавляет документацию

```
docs: расширить CONTRIBUTING.md с процессом code review

Добавлены разделы:
- Как запустить tests локально
- Требования к PR
- Процесс ревью (SLA 4 часа)

Operator: sharnenkov
Agent: Claude Code
Intent: повысить скор дисциплины разработки (Метрика: 20% → 80%)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

### Пример 2: GitHub Actions создаёт issue

```
[GitHub Actions] Автоматический report метрик

Выявлено 3 нарушения Стража:
- Issue #73 без метки
- Коммит abc123 без идентификации
- Task #21 без критерия закрытия

Operator: guardian-bot
Agent: GitHub Actions
Intent: мониторинг соответствия правилам репозитория (RULES.md)

Co-Authored-By: GitHub Actions <action@github.com>
```

---

## ❌ Примеры НЕПРАВИЛЬНЫХ коммитов

### ❌ Нет идентификации вообще

```
fix: улучшить документацию
```
**ОШИБКА:** Не понятно кто запустил агента и зачем.

---

## 📝 Полный шаблон коммита

```
[категория]: [короткое описание действия]

[Опциональное подробное описание того что было сделано]

Operator: [кто запустил]
Agent: [какой агент]
Intent: [зачем / в контексте какой метрики или issue]

Co-Authored-By: [Имя Агента] <[email]>
```

---

## 🎯 Кто может быть Operator?

- **Человек:** sharnenkov, denisrudomanenko-stack, Bronislav28
- **Бот:** github-actions, guardian-bot

## 🤖 Кто может быть Agent?

- **Claude Code:** Claude Code
- **Claude.ai:** Claude.ai (или конкретная версия)
- **GitHub Actions:** GitHub Actions

---

*Последнее обновление: 2026-07-02*
