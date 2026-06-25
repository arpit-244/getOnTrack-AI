import AIInsight from "../models/AIInsight";
import {chatCompletion, SYSTEM_PROMPTS} from "../utils/aiService.js";
import {lastNDays, calcStreak,todayKey} from "../utils/dateHelpers.js"

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
          .join("\n")}\n\nPlease write the personalised weekly report now`;

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
