// Import necessary AWS SDK clients and required node modules
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const fs = require('fs'); // File System module for reading and writing files
const moment = require('moment'); // For date and time formatting
const xml2js = require('xml2js'); // For parsing XML

// Initialize the SQS client with the AWS region
const sqsClient = new SQSClient({ region: "us-east-1" });

// Queue URLs for sending and receiving messages
const DOWNWARD_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/662724091479/P3DownwardQueue.fifo";
const UPWARD_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/662724091479/P3UpwardQueue.fifo";

// Log file and DMV database path
const logFileName = 'DMVServiceLog.log';
const dmvDatabasePath = 'C:/Users/Treviour/OneDrive/Documents/CS455/Project3/DMVDatabase.xml'; 

// Function to append log messages with a timestamp to a log file
async function writeToLogFile(message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss'); // Time formatted
    const content = `${timestamp}: ${message}\n`; // Log message with timestamp
    fs.appendFile(logFileName, content, err => { // Append the content to the log file
        if (err) {
            console.error("Error writing to log file:", err);
        } else {
            console.log("Log updated:", content);
        }
    });
}

// Function to query vehicle information from the DMV database XML file based on a license plate
async function queryDMVDatabase(licensePlate) {
    const parser = new xml2js.Parser(); // XML parser
    const xml = fs.readFileSync(dmvDatabasePath, 'utf8'); // Read the DMV database file
    let vehicleInfo = null;

    await parser.parseString(xml, (err, result) => { // Parse the XML data
        if (err) {
            console.error("Error parsing XML:", err);
            return;
        }
        const vehicles = result.dmv.vehicle; // Access the vehicle elements
        const vehicle = vehicles.find(v => v.$.plate === licensePlate); // Find the vehicle by license plate
        if (vehicle) {
            vehicleInfo = { // Extract vehicle details
                plate: licensePlate,
                make: vehicle.make[0],
                model: vehicle.model[0],
                color: vehicle.color[0],
                owner: {
                    name: vehicle.owner[0].name[0],
                    contact: vehicle.owner[0].contact[0]
                }
            };
        }
    });
    return vehicleInfo;
}

// Function to poll messages from the DownwardQueue, process them, and respond via UpwardQueue
async function pollDownwardQueue() {
    const command = new ReceiveMessageCommand({
        QueueUrl: DOWNWARD_QUEUE_URL,
        MaxNumberOfMessages: 1, // Fetch up to 1 message at a time
        WaitTimeSeconds: 20, // Long polling for 20 seconds
    });

    const response = await sqsClient.send(command); // Send command to receive messages

    if (response.Messages && response.Messages.length > 0) {
        for (const message of response.Messages) {
            // Extract message details
            const body = JSON.parse(message.Body);
            const licensePlate = body.licensePlate;
            const violation = body.violation; // Capture the violation data
            const time = body.time; // Capture the time data
            const location = body.location; // Capture the location data

            // Log the received message
            await writeToLogFile(`Read message for license plate ${licensePlate} with violation ${violation}, time ${time}, location ${location}: ${JSON.stringify(body)}`);

            // Query the DMV database for vehicle details
            const vehicleDetails = await queryDMVDatabase(licensePlate);

            if (vehicleDetails) {
                // Append violation data to vehicleDetails before sending to UpwardQueue
                vehicleDetails.violation = violation;
                vehicleDetails.time = time;
                vehicleDetails.location = location;
                
                // Send the enriched vehicle details to the UpwardQueue
                await writeToLogFile(`Sending vehicle details to UpwardQueue for license plate ${licensePlate}`);
                await postMessageToUpwardQueue(vehicleDetails);
            } else {
                // Log if the vehicle details are not found
                await writeToLogFile(`Vehicle details not found for license plate ${licensePlate}`);
            }
            // Delete the processed message from the DownwardQueue
            await deleteMessageFromQueue(DOWNWARD_QUEUE_URL, message.ReceiptHandle);
        }
    } else {
        // Log if no messages are found in the DownwardQueue
        await writeToLogFile("No messages found in DownwardQueue.");
    }
}

// Function to post messages to the UpwardQueue with enriched vehicle details
async function postMessageToUpwardQueue(message) {
    const command = new SendMessageCommand({
        QueueUrl: UPWARD_QUEUE_URL,
        MessageBody: JSON.stringify(message), // Convert the message object to a string
        MessageGroupId: "DMVDataGroup", // Required for FIFO queues
        MessageDeduplicationId: `${message.plate}-${Date.now()}`, // Generate a unique ID for message deduplication
    });

    // Log the message being sent
    await writeToLogFile(`Sending to UpwardQueue: Vehicle Plate: ${message.plate}, Make: ${message.make}, Model: ${message.model}, Color: ${message.color}, Owner: ${message.owner.name}, Contact: ${message.owner.contact}, Violation: ${message.violation}, Time: ${message.time}, Location: ${message.location}`);

    try {
        await sqsClient.send(command); // Send the message
        console.log(`Sent message to UpwardQueue: ${JSON.stringify(message)}`);
    } catch (error) {
        console.error("Error posting message to UpwardQueue:", error);
    }
}

// Function to delete a message from a queue given its receipt handle
async function deleteMessageFromQueue(queueUrl, receiptHandle) {
    const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
    });

    try {
        await sqsClient.send(command); // Send the delete command
        await writeToLogFile(`Message deleted from queue: ${queueUrl}`);
    } catch (error) {
        console.error("Error deleting message from queue:", error);
        await writeToLogFile(`Error deleting message from queue: ${error.message}`);
    }
}

console.log("DMVService started...");
setInterval(pollDownwardQueue, 5000);
