// Import necessary AWS SDK clients for interacting with SQS and SNS services
import { SQSClient, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

// Initialize SNS and SQS clients with the AWS region
const snsClient = new SNSClient({ region: "us-east-1" });
const sqsClient = new SQSClient({ region: "us-east-1" });

// Constants for the SQS queue URL and SNS topic ARN (Amazon Resource Name)
const UPWARD_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/662724091479/P3UpwardQueue.fifo";
const SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:662724091479:TicketAlertTopic";

// Predefined fines for different types of traffic violations
const fines = {
    no_stop: 300,
    no_full_stop_on_right: 75,
    no_right_on_red: 125,
};

// The main handler function that processes SQS messages
export const handler = async (event) => {
    try {
        // Loop through each record in the event
        for (const record of event.Records) {
            // Parse the SQS message body to a JSON object
            const message = JSON.parse(record.body);
            // Determine the fine amount based on the violation type in the message
            const fineAmount = fines[message.violation];
            // Format the email body with the violation details and fine amount
            const emailBody = formatEmailBody(message, fineAmount);

            // Send an email notification about the violation via SNS
            await sendEmailNotification(SNS_TOPIC_ARN, emailBody);
            // Delete the processed message from the SQS queue
            await deleteMessageFromSQSQueue(UPWARD_QUEUE_URL, record.receiptHandle);
        }
    } catch (error) {
        // Log and rethrow any errors encountered during processing
        console.error("Error processing messages:", error);
        throw error;
    }
};

// Helper function to format the email body sent to the vehicle owner
function formatEmailBody(details, fineAmount) {
    // Convert the ISO string time to a more readable format
    const violationTime = new Date(details.time).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

    return `Hello ${details.owner.name},
Your vehicle was involved in a traffic violation. Please pay the specified ticket amount by 30 days:
Vehicle: ${details.color} ${details.make} ${details.model}
License plate: ${details.plate}
Date: ${violationTime}
Violation address: ${details.location}
Violation type: ${details.violation}
Ticket amount: $${fineAmount}`;
}

// Function to send the email notification using SNS
async function sendEmailNotification(topicArn, message) {
    // Prepare the PublishCommand with the topic ARN and message body
    const command = new PublishCommand({
        TopicArn: topicArn,
        Message: message,
    });

    try {
        // Send the command and log the response
        const response = await snsClient.send(command);
        console.log("Email sent successfully:", response);
    } catch (error) {
        // Log and rethrow any errors encountered during sending
        console.error("Error sending email notification:", error);
        throw error;
    }
}

// Function to delete a message from an SQS queue
async function deleteMessageFromSQSQueue(queueUrl, receiptHandle) {
    // Prepare the DeleteMessageCommand with the queue URL and receipt handle
    const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
    });

    try {
        // Send the command to delete the message
        await sqsClient.send(command);
    } catch (error) {
        // Log and rethrow any errors encountered during deletion
        console.error("Error deleting message from queue:", error);
        throw error;
    }
};
