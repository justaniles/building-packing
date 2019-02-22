const fs = require("fs");
const path = require("path");
import * as csv from "csvtojson";
import * as CsvString from "./csv-string";
import {
    Family,
    FamilyGroup,
    packBuildings,
    HousingType,
    BuildingGroup,
    FamilyRequestingBuilding
} from "./building-packing";

const numberRegex = /([0-9]+)/;

interface CsvFamily {
    "Group number": string;
    "Total # Room Type": string;
    "Total # people": string;
    "Primary Registrant": string;
    "Primary Registrant Last": string;
    "House/Hotel Name Assigned": string;
    Email: string;
}

interface CsvBuilding {
    Name: string;
    "Housing Type": string;
    "Building Group #": string;
    "Total Capacity": string;
}

interface ReadCsvResult {
    familyGroups: FamilyGroup[];
    buildingGroups: BuildingGroup[];
    assignedFamilies: FamilyRequestingBuilding[];
}

function extractHousingType(str: string): HousingType | undefined {
    const strLower = str.toLowerCase();
    if (strLower === "hotel") {
        return "hotel";
    } else if (strLower === "cottage") {
        return "cottage";
    }

    console.log(
        `[WARN] Could not parse housing type '${str}', defaulting to any.`
    );
}

async function readCsv(): Promise<ReadCsvResult> {
    // Read families
    const csvFamilies: CsvFamily[] = await csv().fromFile(
        path.resolve(__dirname, "../input_families.csv")
    );
    const familyGroupMap = new Map<string, FamilyGroup>();
    const assignedFamilies: FamilyRequestingBuilding[] = [];
    csvFamilies.forEach(csvFamily => {
        // Create family
        const familyName = `${csvFamily["Primary Registrant"]} ${
            csvFamily["Primary Registrant Last"]
        } (${csvFamily["Email"]})`;
        const familySize = Number.parseInt(csvFamily["Total # people"]);
        if (isNaN(familySize)) {
            console.log(
                `[WARN] Skipping family '${familyName}': Could not parse family size '${
                    csvFamily["Total # people"]
                }'`
            );
            return;
        }
        const housingTypeString = csvFamily["Total # Room Type"];
        const family: Family = {
            name: `${csvFamily["Primary Registrant"]} ${
                csvFamily["Primary Registrant Last"]
            } (${csvFamily["Email"]})`,
            size: familySize,
            requiredHousingType:
                (housingTypeString && extractHousingType(housingTypeString)) ||
                undefined
        };

        const requestedBuilding = csvFamily["House/Hotel Name Assigned"];
        if (requestedBuilding) {
            // Family is explicitly assigned to a building
            assignedFamilies.push({
                ...family,
                requestedBuildingName: requestedBuilding
            });
        } else {
            // Add to family group
            const groupNumber = csvFamily["Group number"];
            const priority = Number.parseInt(
                (groupNumber.match(numberRegex) || [])[1]
            );
            if (isNaN(priority)) {
                console.log(
                    `[WARN] Skipping family '${familyName}': Could not parse priority from group number '${groupNumber}'`
                );
                return;
            }

            const familyGroupName = "Group" + groupNumber;
            const familyGroup: FamilyGroup = familyGroupMap.get(
                familyGroupName
            ) || {
                name: familyGroupName,
                priority,
                size: 0,
                families: []
            };

            familyGroup.families.push(family);
            familyGroup.size += familySize;
            familyGroupMap.set(familyGroupName, familyGroup);
        }
    });

    // Read buildings
    const csvBuildings: CsvBuilding[] = await csv().fromFile(
        path.resolve(__dirname, "../input_buildings.csv")
    );
    const buildingGroupMap = new Map<string, BuildingGroup>();
    csvBuildings.forEach(csvBuilding => {
        const buildingName = csvBuilding["Name"];
        const priority = Number.parseInt(csvBuilding["Building Group #"]);
        if (isNaN(priority)) {
            throw new Error(
                `Could not parse building group priority for '${buildingName}'`
            );
        }

        const capacity = Number.parseInt(csvBuilding["Total Capacity"]);
        if (isNaN(capacity)) {
            throw new Error(
                `Could not parse building group capacity for '${buildingName}'`
            );
        }

        const buildingGroupName = "BuildingGroup" + priority;
        const buildingGroup: BuildingGroup = buildingGroupMap.get(
            buildingGroupName
        ) || {
            name: buildingGroupName,
            priority: priority,
            buildings: []
        };

        buildingGroup.buildings.push({
            name: buildingName,
            capacity,
            housingType: csvBuilding[
                "Housing Type"
            ].toLowerCase() as HousingType
        });
        buildingGroupMap.set(buildingGroupName, buildingGroup);
    });

    return {
        buildingGroups: [...buildingGroupMap.values()],
        familyGroups: [...familyGroupMap.values()],
        assignedFamilies
    };
}

async function main() {
    const { familyGroups, buildingGroups, assignedFamilies } = await readCsv();
    const packing = packBuildings(
        buildingGroups,
        familyGroups,
        assignedFamilies
    );

    const csvCreator = CsvString.create([
        "Family",
        "Family Group",
        "Family Size",
        "Building Name"
    ]);

    csvCreator.addComment("Buildings filled:");
    packing.buildingResults.forEach(buildingResult => {
        csvCreator.addComment(
            `  ${buildingResult.name} (#${buildingResult.priority}): ${
                buildingResult.capacityFilled
            }/${buildingResult.capacity}`
        );
    });
    csvCreator.addComment(" ");

    if (packing.noMatches.length) {
        csvCreator.addComment(
            `No matches: ${packing.noMatches
                .map(family => `${family.name}/${family.size}`)
                .join(",")}`
        );
        csvCreator.addComment(" ");
    }
    packing.assignments.forEach(assignment => {
        csvCreator.addRow({
            Family: assignment.familyName,
            "Family Group": assignment.familyGroup,
            "Family Size": assignment.familySize,
            "Building Name": assignment.buildingName
        });
    });

    const csvString = csvCreator.toString();
    // console.log(csvString);
    fs.writeFileSync(
        path.resolve(__dirname, "building-assignments.csv"),
        csvString
    );
    console.log("Packing complete!");
}

main();
