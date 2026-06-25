import AIInsight from "../models/AIInsight.js";
import {chatCompletion, SYSTEM_PROMPTS} from "../utils/aiService.js";
import {lastNDays, calcStreak,todayKey} from "../utils/dateHelpers.js"
import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";


const buildWeeklyContext =async (userId)=>{
    const habits=await Habit.find({userId,isArchived:false});
    const days =lastNDays(7);
    const logs=await HabitLog.find({
        userId, completedDate:{$gte:days[0], $lte:days[days.length-1]}
    });

    const perHabit= habits.map((h)=>{
        const completed= logs.filter(
            (l)=>String(l.habitId)===String(h._id)
        ).length;
        return {
            name:h.name,
            category:h.category,
            frequency:h.frequency,
            targetDays:h.targetDays,
            completedDays:completed,
        };
        
    });
    return {days,perHabit};
};

export const weeklyReport =async(req,res)=>{
    try{
        const ctx=await buildWeeklyContext(req.user._id);
        if(!ctx.perHabit.length){
            return res.json({
                content:"You dont't have any habits yet. Please add a habit to get started."
            });
        }
        const userMsg=`Here is the user's habit data for the past 7 days (${ctx.days[0]} to ${ctx.days[6]}):\n\n${ctx.perHabit
          .map(
            (h)=>
                `- ${h.name} (${h.category}, ${h.frequency}): completed ${h.completedDays} of the past 7 days, target ${h.targetDays}/week`
          )
          .join("\n")}\n\nPlease write the personalised weekly report now, keep above specified rules strictly in mind  `;

          const {content}=await chatCompletion({
            system:SYSTEM_PROMPTS.weekly,
            user:userMsg,
          });

          await AIInsight.create({
            userId:req.user._id,
            type:"weekly",
            content,
          });

          res.json({content});
            
    }catch(err){
        res.status(500).json({message:err.message});
    }
};


export const suggestHabits = async (req, res) => {
  try {
    const {
      goals,
      productiveTime,
      struggles,
    } = req.body;

    const userMsg = `
User goals: ${goals || "not provided"}
Most productive time: ${productiveTime || "not provided"}
Past struggles: ${struggles || "not provided"}

Suggest 3 personalised habits now.
Return JSON only.
`;

    const { content } = await chatCompletion({
      system: SYSTEM_PROMPTS.suggestion,
      user: userMsg,
    });


    let suggestions = [];

    try {
      const parsed = JSON.parse(
        content.replace(/```json|```/g, "").trim()
      );

      suggestions = parsed.suggestions || [];
    } catch {
      suggestions = [];
    }

    if (!suggestions.length) {
      suggestions = [
        {
          name: "10-minute morning walk",
          description:
            "Start the day with light movement and fresh air.",
          frequency: "daily",
          category: "Fitness",
          icon: "🚶",
          reason:
            "Low-friction way to build consistency early in the day.",
        },
        {
          name: "Read 5 pages",
          description:
            "Short daily reading to build a learning routine.",
          frequency: "daily",
          category: "Learning",
          icon: "📚",
          reason:
            "Compounds into significant knowledge over weeks.",
        },
        {
          name: "2 minutes of mindful breathing",
          description:
            "Pause and breathe to reset focus and reduce stress.",
          frequency: "daily",
          category: "Mindfulness",
          icon: "🧘‍♂️",
          reason:
            "Tiny anchor habit that fits any schedule.",
        },
      ];
    }

    await AIInsight.create({
      userId: req.user._id,
      type: "suggestion",
      content: JSON.stringify(suggestions),
      meta: {
        goals,
        productiveTime,
        struggles,
      },
    });

    res.json({
      suggestions,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

//

export const recoveryPlan = async (req, res) => {
  try {
    const { habitId } = req.body;

    const habit = await Habit.findOne({
      _id: habitId,
      userId: req.user._id,
    });

    if (!habit) {
      return res.status(404).json({
        message: "Habit not found",
      });
    }

    const logs = await HabitLog.find({
      userId: req.user._id,
      habitId,
    }).sort({ completedDate: -1 });

    const keys = logs.map((l) => l.completedDate);

    const { current, longest } = calcStreak(keys);

    const userMsg = `
Habit: ${habit.name} (${habit.category})
Description: ${habit.description || "none"}

Current streak: ${current} days.
Longest ever: ${longest} days.

The user just broke a streak.

Write a warm, actionable 3-day recovery plan.
`;

    const { content } = await chatCompletion({
      system: SYSTEM_PROMPTS.recovery,
      user: userMsg,
    });

    await AIInsight.create({
      userId: req.user._id,
      type: "recovery",
      content,
      meta: { habitId },
    });

    res.json({ content });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

export const chatAnalysis = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        message: "Question is required",
      });
    }

    const habits = await Habit.find({
      userId: req.user._id,
      isArchived: false,
    });

    const days = lastNDays(30);

    const logs = await HabitLog.find({
      userId: req.user._id,
      completedDate: {
        $gte: days[0],
        $lte: days[days.length - 1],
      },
    });

    const context = habits
      .map((h) => {
        const hLogs = logs.filter(
          (l) => String(l.habitId) === String(h._id)
        );

        const dateKeys = hLogs
          .map((l) => l.completedDate)
          .sort()
          .reverse();

        const { current, longest } = calcStreak(dateKeys);

        const byDow = [0, 0, 0, 0, 0, 0, 0];

        for (const l of hLogs) {
          const dow = new Date(l.completedDate).getDay();
          byDow[dow] += 1;
        }

        const createdKey = h.createdAt
          .toISOString()
          .slice(0, 10);

        const start = new Date(createdKey);
        const end = new Date();

        const totalDays =
          Math.max(
            0,
            Math.round(
              (end - start) /
                (1000 * 60 * 60 * 24)
            )
          ) + 1;

        const completionRate = Math.round(
          (hLogs.length / totalDays) * 100
        );

        return `
    Habit: ${h.name}
    Category: ${h.category}
    Description: ${h.description || "None"}

Last 30 Days Completions: ${hLogs.length}
Current Streak: ${current}
Longest Streak: ${longest}
Completion Rate: ${completionRate}%

Weekday Pattern (Sun-Sat):
${byDow.join(", ")}
`;
      })
      .join("\n--------------------\n");

    const userMsg = `
User Question:
${question}

Habit Data:

${context}

Answer using ONLY the information provided above.
If the information is insufficient, say so clearly.
`;

    const { content } = await chatCompletion({
      system: SYSTEM_PROMPTS.chat,
      user: userMsg,
    });

    await AIInsight.create({
      userId: req.user._id,
      type: "chat",
      content,
      meta: { question },
    });

    res.json({ content });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


export const morningMotivation =async(req, res)=>{
  
    try{

        const todayKeyStr = todayKey();

    const existing = await AIInsight.findOne({
      userId: req.user._id,
      type: "morning",
    }).sort({ createdAt: -1 });

    if (
      existing &&
      existing.createdAt.toISOString().slice(0, 10) === todayKeyStr
    ) {
      return res.json({
        content: existing.content,
      });
    }

    const habits = await Habit.find({
      userId: req.user._id,
      isArchived: false,
    });
        if(!habits.length){
            return res.json({
                content:"Good Morning! Add your first habit today and let's get the momentum started.",
            });
        }
        const days=lastNDays(30);
        const logs=await HabitLog.find({
            userId: req.user._id,
            completedDate:{$gte:days[0], $lte:days[days.length-1]}
        });

        const ctx=habits.map((h)=>{
            const hLogs= logs
            .filter((l)=> String(l.habitId)===String(h._id))
            .map((l)=>l.completedDate)
            .sort()
            .reverse();
            const {current}=calcStreak(hLogs);
            return `${h.name}: current streak ${current}`;
        })
        .join("\n");

        const today=todayKey();
        const todayLogs= logs.filter((l)=>l.completedDate===today);
        const done= todayLogs.length;
        const total=habits.length;

        
        const userMsg = `
Today's habits and streaks:

${ctx}

Done today: ${done}/${total}

Write a short personalised morning motivation message.

Requirements:
- 30 to 60 words only
- Sound warm and encouraging
- Mention one or two habit names if relevant
- Acknowledge current streaks when appropriate
- Create momentum for today
- Avoid generic motivational quotes
- Write like a supportive friend
`;
          
     const {content}=await chatCompletion({
        system:SYSTEM_PROMPTS.morning,
        user:userMsg,
        temperature:0.8
     });

     await AIInsight.create({
        userId:req.user._id,
        type:"morning",
        content,
     });
     res.json({content});

    }
    catch(err){
        res.status(500).json({message:err.message});
    }
};