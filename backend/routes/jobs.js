import express from "express";
const router = express.Router();
import { Job } from "../models/jobSchema.js";
import { Candidate, Recruiter } from "../models/candidateModel.js";
import { ResumeFile } from "../models/jobSchema.js";
import multer from "multer";
import { isCandidate, isRecruiter } from "../middlewares/authMiddleware.js";
import JWT from "jsonwebtoken";
import { sendMail } from "../controllers/sendMail.js";
import { viewResume } from "../controllers/viewResume.js";
import MyResumeSchema from "../models/ResumePdf.js";
import axios from "axios";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/mail", sendMail);

router.get("/resume/:userId", viewResume);

// POST - Create a new job
router.post("/", async (req, res) => {
  try {
    const recruiterId = req.body.recruiterId;
    if (!recruiterId) {
      return res.status(400).send({ error: "Recruiter ID is required" });
    }

    const recruiter = await Recruiter.findById(recruiterId);
    if (!recruiter) {
      return res.status(404).send({ error: "Recruiter not found" });
    }

    const job = new Job({
      title: req.body.title,
      requirements: req.body.requirements,
      location: req.body.location,
      salaryRange: req.body.salaryRange,
      description: req.body.description,
      seats: req.body.seats,
      createdBy: recruiterId,
      company: recruiter.company,
      active: true,
      status: "none",
    });

    await job.save();
    res.status(201).send(job);
  } catch (error) {
    console.error("Failed to create job:", error);
    res.status(400).send({ error: error.message });
  }
});

// GET - Retrieve all jobs
router.get("/all", async (req, res) => {
  try {
    const jobs = await Job.find({});
    res.send(jobs);
  } catch (error) {
    res.status(500).send(error);
  }
});

// GET endpoint to fetch jobs by recruiter ID
// router.get("/all/recruiter", async (req, res) => {
//   try {
//     const recruiterId = req.query.recruiterId;
//     if (!recruiterId) {
//       return res.status(400).send({ error: "Recruiter ID is required" });
//     }

//     // Find all jobs where 'createdBy' matches the provided recruiter ID
//     const jobs = await Job.find({ createdBy: recruiterId });

//     // Respond with the found jobs
//     res.status(200).send(jobs);
//   } catch (error) {
//     // Log the error and respond with a 500 status code for server error
//     console.error("Failed to fetch jobs:", error);
//     res.status(500).send({ error: error.message });
//   }
// });

// GET - Retrieve a single job by ID
router.get("/:jobId", async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).send();
    }
    res.send(job);
  } catch (error) {
    res.status(500).send(error);
  }
});

// GET - Retrieve all candidates for a job by ID
router.get("/:jobId/candidates", async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).send("Job not found");
    }

    // Extract candidateIds from the job's candidates array
    const candidateIds = job.candidates.map((c) => c.candidateId);

    // Find candidates with those IDs
    const candidates = await Candidate.find({ _id: { $in: candidateIds } });

    res.send(candidates);
  } catch (error) {
    res.status(500).send(error);
  }
});

// GET - Retrieve all candidates for a job by ID for Interviews
router.get("/:jobId/interviews", async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).send("Job not found");
    }

    // Extract candidateIds from the interviews array
    const candidateIds = job.interviews.map(
      (interview) => interview.candidateId
    );

    // Find candidates whose IDs are in the candidateIds array
    const candidates = await Candidate.find({ _id: { $in: candidateIds } });

    // Optionally, include interview details if needed
    const candidatesWithInterviewDetails = candidates.map((candidate) => {
      const interviewDetails = job.interviews.find(
        (interview) => interview.candidateId === candidate._id.toString()
      );
      return {
        ...candidate.toObject(), // Converting Mongoose document to plain object
        interviewDate: interviewDetails.interviewDate,
      };
    });

    res.json(candidatesWithInterviewDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/candidate/:candidateId", async (req, res) => {
  const candidateId = req.params.candidateId;

  if (!candidateId) {
    return res.status(400).send({ error: "Candidate ID is required" });
  }

  try {
    const candidate = await Candidate.findById(candidateId).select(
      "name email"
    );
    if (!candidate) {
      return res.status(404).send({ error: "Candidate not found" });
    }
    res.status(200).send(candidate);
  } catch (error) {
    console.error("Failed to fetch candidate:", error);
    res.status(500).send({ error: "Server error", details: error.message });
  }
});

// GET - Retrieve all candidates for a Interviews
router.get("/interviews/:recruiterId", async (req, res) => {
  const recruiterId = req.params.recruiterId;

  if (!recruiterId) {
    return res.status(400).send({ error: "Recruiter ID is required" });
  }

  console.log("Recruiter ID:", recruiterId);
  try {
    // Assuming Job model is correctly linked with the Candidate model
    const jobs = await Job.find({ createdBy: recruiterId }).populate({
      path: "candidates.candidateId",
      select: "name email", // Only fetch name and email from the Candidate document
    });

    console.log("Jobs found:", jobs.length); // Debugging output

    const candidatesForInterview = jobs.reduce((acc, job) => {
      const interviewCandidates = job.candidates.filter(
        (candidate) => candidate.status === "Interview"
      );
      interviewCandidates.forEach((candidate) => {
        const candidateDetails = candidate.candidateId; // This now contains candidate details populated from the database
        acc.push({
          jobId: job._id,
          jobTitle: job.title,
          candidateId: candidate.candidateId,
          candidateName: candidateDetails.name, // Added candidate name
          candidateEmail: candidateDetails.email, // Added candidate email
          applyDate: candidate.applyDate,
          interviewDate: job.interviews.find(
            (interview) => interview.candidateId === candidate.candidateId
          )?.interviewDate,
        });
      });
      return acc;
    }, []);

    res.status(200).send(candidatesForInterview);
  } catch (error) {
    console.error("Failed to fetch candidate interviews:", error);
    res.status(500).send({
      error: "Failed to fetch candidate interviews",
      details: error.message,
    });
  }
});

// GET - Retrieve all candidates for a hired
router.get("/hired/:recruiterId", async (req, res) => {
  const recruiterId = req.params.recruiterId;

  if (!recruiterId) {
    return res.status(400).send({ error: "Recruiter ID is required" });
  }

  console.log("Recruiter ID:", recruiterId);
  try {
    // Assuming Job model is correctly linked with the Candidate model
    const jobs = await Job.find({ createdBy: recruiterId }).populate({
      path: "candidates.candidateId",
      select: "name email", // Only fetch name and email from the Candidate document
    });

    console.log("Jobs found:", jobs.length); // Debugging output

    const candidatesForInterview = jobs.reduce((acc, job) => {
      const interviewCandidates = job.candidates.filter(
        (candidate) => candidate.status === "Hired"
      );
      interviewCandidates.forEach((candidate) => {
        const candidateDetails = candidate.candidateId; // This now contains candidate details populated from the database
        acc.push({
          jobId: job._id,
          jobTitle: job.title,
          candidateId: candidate.candidateId,
          candidateName: candidateDetails.name, // Added candidate name
          candidateEmail: candidateDetails.email, // Added candidate email
          applyDate: candidate.applyDate,
        });
      });
      return acc;
    }, []);

    res.status(200).send(candidatesForInterview);
  } catch (error) {
    console.error("Failed to fetch candidate interviews:", error);
    res.status(500).send({
      error: "Failed to fetch candidate interviews",
      details: error.message,
    });
  }
});

// GET - Retrieve all candidates for a selected
router.get("/selected/:recruiterId", async (req, res) => {
  const recruiterId = req.params.recruiterId;

  if (!recruiterId) {
    return res.status(400).send({ error: "Recruiter ID is required" });
  }

  console.log("Recruiter ID:", recruiterId);
  try {
    // Assuming Job model is correctly linked with the Candidate model
    const jobs = await Job.find({ createdBy: recruiterId }).populate({
      path: "candidates.candidateId",
      select: "name email", // Only fetch name and email from the Candidate document
    });

    console.log("Jobs found:", jobs.length); // Debugging output

    const candidatesForInterview = jobs.reduce((acc, job) => {
      const interviewCandidates = job.candidates.filter(
        (candidate) => candidate.status === "Selected"
      );
      interviewCandidates.forEach((candidate) => {
        const candidateDetails = candidate.candidateId; // This now contains candidate details populated from the database
        acc.push({
          jobId: job._id,
          jobTitle: job.title,
          candidateId: candidate.candidateId,
          candidateName: candidateDetails.name, // Added candidate name
          candidateEmail: candidateDetails.email, // Added candidate email
          applyDate: candidate.applyDate,
        });
      });
      return acc;
    }, []);

    res.status(200).send(candidatesForInterview);
  } catch (error) {
    console.error("Failed to fetch candidate interviews:", error);
    res.status(500).send({
      error: "Failed to fetch candidate interviews",
      details: error.message,
    });
  }
});

// PUT - Update a job by ID
router.put("/:jobId", async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.jobId, req.body, {
      new: true,
      runValidators: true,
    });
    if (!job) {
      return res.status(404).send();
    }
    res.send(job);
  } catch (error) {
    res.status(400).send(error);
  }
});

// PUT - update selected array to a job by ID
router.put("/toggle-selected/:jobId", async (req, res) => {
  const { index } = req.body; // Index of the candidate in the candidates array
  const { jobId } = req.params;
  console.log(index);

  try {
    // Fetch the current job to access the candidates array
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // Check the current status and toggle it accordingly
    const currentStatus = job.candidates[index].status;
    const newStatus = currentStatus == "Selected" ? "Applied" : "Selected";

    // Update the status of the specific candidate
    const result = await Job.updateOne(
      {
        _id: jobId,
        [`candidates.${index}.candidateId`]: job.candidates[index].candidateId,
      },
      { $set: { [`candidates.${index}.status`]: newStatus } }
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// DELETE - Delete a job by ID
router.delete("/:jobId", async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.jobId);
    if (!job) {
      return res.status(404).send();
    }
    res.send({ message: "Job successfully deleted." });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Endpoint to add a user to the interviews array
router.put("/:jobId/add-interviewee", async (req, res) => {
  console.log("Received data for job:", req.body);
  const { index, userId, interviewDate } = req.body;
  const { jobId } = req.params;

  try {
    // Find the job document first to ensure it exists and to facilitate complex updates
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).send("Job not found");
    }

    // Update or add the interview
    let interviewExists = job.interviews.some(
      (interview) => interview.candidateId === userId
    );
    if (interviewExists) {
      // Update existing interview date
      job.interviews = job.interviews.map((interview) =>
        interview.candidateId === userId
          ? { ...interview, interviewDate: interviewDate }
          : interview
      );
    } else {
      // Add a new interview
      job.interviews.push({
        candidateId: userId,
        interviewDate: interviewDate,
      });
    }

    // Update candidate status to 'interview'
    if (
      index >= 0 &&
      index < job.candidates.length &&
      job.candidates[index].candidateId === userId
    ) {
      job.candidates[index].status = "Interview";
    } else {
      return res
        .status(400)
        .send("Candidate index is out of bounds or candidate ID mismatch");
    }

    // Save the updated job document
    await job.save();

    res.json({
      success: true,
      message: interviewExists
        ? "Interviewee updated successfully"
        : "New interviewee added successfully",
      job,
    });
  } catch (error) {
    console.error("Error adding/updating interviewee:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to set a candidate's status to 'hired' and remove them from interviews
router.put("/:jobId/hire-candidate", async (req, res) => {
  const { jobId } = req.params;
  const { candidateId } = req.body;

  try {
    // Find the job with the given jobId
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).send({ error: "Job not found" });
    }

    // Find the candidate in the candidates array
    const candidateIndex = job.candidates.findIndex(
      (cand) => cand.candidateId === candidateId
    );
    if (candidateIndex === -1) {
      return res
        .status(400)
        .send({ error: "Candidate not found in job candidates" });
    }

    // Remove the candidate from the interviews array
    job.interviews = job.interviews.filter(
      (interview) => interview.candidateId !== candidateId
    );

    job.candidates[candidateIndex].status = "Hired";
    job.hired.push(candidateId);

    await job.save();

    res.send({
      message: "Candidate has been hired and removed from interviews.",
    });
  } catch (error) {
    console.error("Error hiring candidate:", error);
    res
      .status(500)
      .send({ error: "Failed to update job for hiring candidate" });
  }
});

//to reject a candidate
router.put("/:jobId/reject", async (req, res) => {
  const { userId } = req.body;
  const { jobId } = req.params;

  try {
    // Use $addToSet to avoid adding duplicates
    const job = await Job.findByIdAndUpdate(jobId);

    if (!job) {
      return res.status(404).send("Job not found");
    }

    const candidateIndex = job.candidates.findIndex(
      (cand) => cand.candidateId === userId
    );
    if (candidateIndex === -1) {
      return res
        .status(400)
        .send({ error: "Candidate not found in job candidates" });
    }

    // Remove the candidate from the interviews array
    job.interviews = job.interviews.filter(
      (interview) => interview.candidateId !== userId
    );

    // Update the status of the candidate to 'rejected'
    job.candidates[candidateIndex].status = "Rejected";

    // Save the job document
    await job.save();

    res.json({ success: true, message: "rejected successfully", job });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

//Apply for the job
// router.post("/apply", async (req, res) => {
//   const { jobId } = req.body;

//   console.log(req.body);
//   // const userId = req.body.tokenDetails._id;
//   // console.log(userId);
//   try {
//     const job = await Job.findById(jobId);

//     if (!job) {
//       return res.status(404).json({ message: "Jobs not found" });
//     }

//     console.log("Hi from jobs");

//     try {
//       // const decode = JWT.verify(
//       //   req.body.token,
//       //   process.env.JWT_SECRET_CANDIDATE
//       // );
//       // console.log("token info is", decode);
//       // req.body.tokenDetails = decode;
//       // console.log("<<");
//       // console.log(req.body.tokenDetails);
//       // console.log("<<");

//       const userId = req.body.tokenDetails._id;
//       console.log("<<");
//       console.log("user id is", userId);
//       console.log("<<");

//       const hasApplied = job.candidates.some(
//         (candidate) => candidate.candidateId === userId
//       );
//       if (hasApplied) {
//         return res.status(401).json({
//           success: false,
//           message: "You have already applied for the job",
//         });
//       }

//       let resume = await MyResumeSchema.findOne({
//         userId:userId,
//       });

//       if (!resume) {
//         return res.send("No resume found")
//       }

//       console.log(resume)

//       const base64Data = btoa(
//         new Uint8Array(resume.data).reduce(
//           (data, byte) => data + String.fromCharCode(byte),
//           ""
//         )
//       );

//       const newdata = {
//         data:base64Data,
//         id:userId,
//         job_description: job.description,
//       };

//       console.log(newdata)

//       // console.log("new Data is", newdata);

//       // const flaskResponse = await axios.post(
//       //   "http://localhost:9999/predict",
//       //   newdata
//       // );

//       // console.log("Flask response:", flaskResponse.data);

//       const candidates_var = {
//         candidateId: userId,
//         ATS_Score:"20"
//       };

//       job.candidates.push(candidates_var);
//     } catch (error) {
//       res.status(401).send({
//         success: false,
//         error,
//         message: "Error in token verification",
//       });
//     }

//     // console.log(candidates_var);

//     // job.candidates.push(candidates_var);
//     // job.candidates.push(userId);
//     console.log("final job is", job);
//     await job.save();

//     return res
//       .status(200)
//       .json({ message: "Successfully applied for the job" });
//   } catch (error) {
//     console.error("Error Applying for the job", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

//Apply for the job
router.post("/apply", isCandidate, async (req, res) => {
  const { jobId } = req.body;

  console.log(req.body);
  // const userId = req.body.tokenDetails._id;
  // console.log(userId);
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Jobs not found" });
    }

    console.log("Hi from jobs");

    try {
      const userId = req.body.tokenDetails._id;
      console.log("<<");
      console.log("user id is", userId);
      console.log("<<");

      const hasApplied = job.candidates.some(
        (candidate) => candidate.candidateId === userId
      );
      if (hasApplied) {
        return res.status(401).json({
          success: false,
          message: "You have already applied for the job",
        });
      }

      let resume = await MyResumeSchema.findOne({
        userId: userId,
      });

      if (!resume) {
        return res.send("No resume found");
      }

      console.log(resume);

      const base64Data = btoa(
        new Uint8Array(resume.data).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      const newdata = {
        data: base64Data,
        id: userId,
        job_description: job.description,
      };

      console.log(newdata);

      console.log("new Data is", newdata);

      console.log("hey i am wating");

      const flaskResponse = await axios.post(
        "http://127.0.0.1:9999/predict",
        newdata
      );

      console.log("Flask response:", flaskResponse.data);
      const candidates_var = {
        candidateId: userId,
        ATS_Score: flaskResponse.data.ATS,
      };
      job.candidates.sort((a, b) => b.ATS_Score - a.ATS_Score);
      job.candidates.push(candidates_var);
      job.candidates.sort((a, b) => b.ATS_Score - a.ATS_Score);

      console.log("final job is", job);
      await job.save();

      return res
        .status(200)
        .json({ message: "Successfully applied for the job" });
    } catch (error) {
      res.status(401).send({
        success: false,
        error,
        message: "Error in token verification",
      });
    }

    // console.log(candidates_var);

    // job.candidates.push(candidates_var);
    // job.candidates.push(userId);
  } catch (error) {
    console.error("Error Applying for the job", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/tokenDetails", async (req, res) => {
  const token = req.body;
  const userType = req.body;
  if (userType == "CANDIDATE") {
    const decode = JWT.verify(token, process.env.JWT_SECRET_CANDIDATE);
    return res
      .status(200)
      .json({ msg: "token decoded successfully", data: decode });
  }
});
// router.post("/apply", async (req, res) => {
//   const { jobId, userId } = req.body;

//   console.log(userId);
//   try {
//     const job = await Job.findById(jobId);

//     if (!job) {
//       return res.status(404).json({ message: "Jobs not found" });
//     }
//     const candidates_var = {
//       candidateId: userId,
//     };
//     console.log(candidates_var);

//     job.candidates.push(candidates_var);
//     await job.save();

//     return res
//       .status(200)
//       .json({ message: "Successfully applied for the job" });
//   } catch (error) {
//     console.error("Error Applying for the job", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// Route for file upload
router.post("/upload", upload.single("file"), async (req, res, next) => {
  const file = req.file;
  if (!file) {
    const error = new Error("Please upload a file");
    error.httpStatusCode = 400;
    return next(error);
  }

  try {
    // Create new instance of File model
    const newFile = new ResumeFile({
      filename: req.body.customFileName || file.originalname,
      contentType: file.mimetype,
      data: file.buffer,
      userId: file.userId,
    });

    // Save file to MongoDB
    await newFile.save();

    // const formData = new FormData();
    // formData.append('file', file.buffer, {
    //   filename: file.originalname,
    //   contentType: file.mimetype
    // });

    // const flaskResponse = await axios.post('http://localhost:9999/upload', formData, {
    //   headers: {
    //     ...formData.getHeaders()
    //   }
    // });

    // If needed, handle the response from the Flask server here
    // console.log('Response from Flask server:', flaskResponse.data);

    res.send("File uploaded successfully");
  } catch (error) {
    console.error("Error uploading file:", error);
    next(error);
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const jobId = req.params.id;
    const { active } = req.body;

    const updatedJob = await Job.findByIdAndUpdate(
      jobId,
      { active, updatedAt: new Date() },
      { new: true }
    );

    if (!updatedJob) {
      return res.status(404).send({ message: "Job not found" });
    }

    res.send(updatedJob);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

router.get("/all/recruiter", async (req, res) => {
  const recruiterId = req.query.recruiterId;

  if (!recruiterId) {
    return res
      .status(400)
      .send({ message: "recruiterId query parameter is required" });
  }

  try {
    const jobs = await Job.find({ createdBy: recruiterId });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).send({ message: "Error fetching jobs", error });
  }
});

export default router;
